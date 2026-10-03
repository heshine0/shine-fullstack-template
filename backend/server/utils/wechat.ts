import { getEnv } from './env'
import { logger } from './logger'
import { canonicalizePhoneNumber } from './sms'

/**
 * 微信小程序「获取手机号」服务端能力。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/phonenumber/phonenumber.getPhoneNumber.html
 *
 * - 小程序端 button open-type="getPhoneNumber" 回调拿到短时 code（e.detail.code）
 * - 服务端用 access_token + code 调 getuserphonenumber 换真实手机号
 * - WECHAT_MOCK=true 时不访问微信 API（本地/CI 联调），code 约定为 'mock:<手机号>'
 */

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const PHONE_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber'

/** mock phoneCode 前缀，如 'mock:13800138000'（也兼容直接带 +86）。 */
export const MOCK_PHONE_CODE_PREFIX = 'mock:'

export class WechatConfigError extends Error {}
export class WechatApiError extends Error {
  constructor(
    message: string,
    readonly errcode?: number
  ) {
    super(message)
    this.name = 'WechatApiError'
  }
}

interface TokenCache {
  token: string
  /** 毫秒时间戳；提前 5 分钟视为过期 */
  expiresAt: number
}

let tokenCache: TokenCache | null = null

/**
 * 解析 mock phoneCode，返回带国家号的规范手机号（如 '+8613800138000'）。
 * 非 mock 串或号码非法返回 null。
 */
export function parseMockPhoneCode(phoneCode: string): string | null {
  if (!phoneCode.startsWith(MOCK_PHONE_CODE_PREFIX)) return null
  return canonicalizePhoneNumber(phoneCode.slice(MOCK_PHONE_CODE_PREFIX.length))
}

interface AccessTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

interface PhoneNumberResponse {
  errcode?: number
  errmsg?: string
  phone_info?: {
    phoneNumber?: string
    purePhoneNumber?: string
    countryCode?: string | number
  }
}

/** 获取（必要时刷新）小程序 access_token，进程内缓存。 */
async function getAccessToken(): Promise<string> {
  const env = getEnv()
  if (!env.WECHAT_APPID || !env.WECHAT_SECRET) {
    throw new WechatConfigError('未配置 WECHAT_APPID / WECHAT_SECRET，无法调用微信接口')
  }

  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt - 5 * 60_000 > now) {
    return tokenCache.token
  }

  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(env.WECHAT_APPID)}&secret=${encodeURIComponent(env.WECHAT_SECRET)}`
  const resp = await fetch(url)
  const data = await resp.json() as AccessTokenResponse
  if (!data.access_token || data.errcode) {
    tokenCache = null
    throw new WechatApiError(`获取微信 access_token 失败：${data.errmsg ?? 'unknown'}`, data.errcode)
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 7200) * 1000
  }
  return tokenCache.token
}

/** 用小程序端回传的 code 换取手机号；mock 模式直接解析 code。 */
export async function getPhoneNumberByCode(phoneCode: string): Promise<string> {
  const env = getEnv()

  if (env.WECHAT_MOCK) {
    const phone = parseMockPhoneCode(phoneCode)
    if (!phone) {
      throw new WechatApiError(`mock 模式下 phoneCode 必须为 '${MOCK_PHONE_CODE_PREFIX}<11位手机号>' 且号码合法`)
    }
    logger.warn(`[WeChat][MOCK] 模拟获取手机号成功：${phone}（WECHAT_MOCK=true，禁止用于生产）`)
    return phone
  }

  const code = phoneCode.trim()
  if (!code) throw new WechatApiError('phoneCode 为空')

  const accessToken = await getAccessToken()
  const resp = await fetch(`${PHONE_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })
  const data = await resp.json() as PhoneNumberResponse
  if (data.errcode || !data.phone_info?.purePhoneNumber) {
    throw new WechatApiError(`获取微信手机号失败：${data.errmsg ?? 'unknown'}`, data.errcode)
  }

  // 微信返回 countryCode（区号，如 86）+ purePhoneNumber（不带区号），
  // 统一拼成 E.164 形态（'+8613800138000'）存储，保证与 OTP 登录同一用户只建一个号
  const cc = String(data.phone_info.countryCode ?? '86').replace(/\D/g, '')
  const digits = data.phone_info.purePhoneNumber.replace(/\D/g, '')
  if (cc === '86') {
    const phone = canonicalizePhoneNumber(digits)
    if (!phone) {
      throw new WechatApiError(`微信返回的手机号格式无法识别：${data.phone_info.purePhoneNumber}`)
    }
    return phone
  }
  if (!/^\d{1,5}$/.test(cc) || digits.length < 4 || digits.length > 15) {
    throw new WechatApiError(`微信返回的手机号格式无法识别：+${cc} ${digits}`)
  }
  return `+${cc}${digits}`
}
