import { http } from '@/http/alova'
import type { ApiEnvelope } from '@/http/alova'

/** 更新当前用户资料（Better Auth 原生端点，成功返回裸 user）。 */
export function updateMyProfile(payload: { name?: string, image?: string }) {
  return http.Post('/auth/update-user', payload, {
    meta: { rawAuth: true },
  })
}

/** 换绑手机号第一步：向新手机号发送短信验证码。 */
export function sendChangePhoneOtp(phoneNumber: string) {
  return http.Post('/auth/phone-number/send-otp', { phoneNumber }, {
    meta: { rawAuth: true },
  })
}

/**
 * 换绑手机号第二步：校验验证码并更新绑定。
 * updatePhoneNumber:true 时 Better Auth 要求登录会话，并自动拒绝已被他人占用的号码。
 */
export function verifyChangePhone(phoneNumber: string, code: string) {
  return http.Post(
    '/auth/phone-number/verify',
    { phoneNumber, code, updatePhoneNumber: true },
    { meta: { rawAuth: true } },
  )
}

export interface UploadResult {
  url: string
}

interface RawUploadResponse {
  statusCode?: number
  data?: string | ApiEnvelope<UploadResult>
}

/**
 * 上传头像文件，返回可写入 user.image 的公开 URL。
 * upload 请求经 @alova/adapter-uniapp 走 uni.uploadFile，响应拦截器不解包，需自行判错。
 */
export async function uploadAvatar(filePath: string): Promise<string> {
  const res = await http.Post(
    '/upload/avatar',
    { name: 'file', filePath },
    { requestType: 'upload' },
  ) as RawUploadResponse

  const statusCode = res.statusCode ?? 0
  if (statusCode < 200 || statusCode >= 300) {
    const message = pickEnvelopeMessage(res.data) || `头像上传失败[${statusCode}]`
    uni.showToast({ title: message, icon: 'none' })
    throw new Error(message)
  }

  const url = parseEnvelope(res.data)?.url
  if (!url) {
    const message = '头像上传响应异常'
    uni.showToast({ title: message, icon: 'none' })
    throw new Error(message)
  }
  return url
}

function parseEnvelope(data: RawUploadResponse['data']): UploadResult | null {
  if (!data)
    return null
  const body = typeof data === 'string' ? safeJsonParse(data) : data
  return body?.code === 'OK' ? body.data : null
}

function pickEnvelopeMessage(data: RawUploadResponse['data']): string {
  if (!data)
    return ''
  const body = typeof data === 'string' ? safeJsonParse(data) : data
  return body?.message || ''
}

function safeJsonParse(text: string): ApiEnvelope<UploadResult> | null {
  try {
    return JSON.parse(text) as ApiEnvelope<UploadResult>
  }
  catch {
    return null
  }
}

/**
 * 将后端返回的相对媒体路径（如 /api/uploads/avatars/x.jpg）解析为当前端可访问的地址。
 * - H5：直接用相对路径，经 vite 代理同源访问
 * - 小程序/App：拼接后端基址直连（图片请求本身公开，无需 Cookie）
 * 已是 http(s)/data 地址时原样返回。
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url)
    return ''
  if (/^(?:https?:)?\/\//.test(url) || url.startsWith('data:'))
    return url
  let resolved = url.startsWith('/') ? url : `/${url}`
  // #ifndef H5
  resolved = `${import.meta.env.VITE_SERVER_BASEURL}${resolved}`
  // #endif
  return resolved
}
