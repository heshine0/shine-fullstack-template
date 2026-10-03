import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'
import { normalizePhoneNumber } from './sms'
import { WechatConfigError, getPhoneNumberByCode } from './wechat'

/**
 * 微信小程序「获取手机号」一键登录插件。
 *
 * 端点：POST /api/auth/wechat/phone-sign-in { phoneCode }
 * - phoneCode 来自小程序 button open-type="getPhoneNumber" 回调的 e.detail.code
 * - 服务端换得手机号后：命中已有用户则登录（顺带补标 phoneNumberVerified），
 *   不存在则以手机号建号（databaseHooks 自动挂 user 角色）
 * - 被封禁用户在登录入口直接 403
 * - 与内置端点一致：创建会话并通过 Set-Cookie 下发 better-auth.session_token
 */

const TEMP_EMAIL_SUFFIX = '@phone.local'

/** 插件上下文中经适配器读写的 user 行（仅列本端点使用的字段）。 */
interface WechatUserRow {
  id: string
  email: string
  name: string
  phoneNumber?: string | null
  phoneNumberVerified?: boolean
  banned?: boolean
  [key: string]: unknown
}

const wechatPhoneSignIn = createAuthEndpoint(
  '/wechat/phone-sign-in',
  {
    method: 'POST',
    body: z.object({
      phoneCode: z.string().min(1, 'phoneCode 不能为空')
    })
  },
  async (ctx) => {
    let phone: string
    try {
      phone = await getPhoneNumberByCode(ctx.body.phoneCode)
    } catch (err) {
      const message = err instanceof Error ? err.message : '微信登录失败'
      if (err instanceof WechatConfigError) {
        throw new APIError('INTERNAL_SERVER_ERROR', { message })
      }
      throw new APIError('BAD_REQUEST', { message })
    }

    const { adapter, internalAdapter } = ctx.context

    // 适配器在插件上下文中以动态行返回，按 better-auth user 模型读取。
    // phone 为带国家号形态（如 '+8613800138000'）；同时兼容历史的裸 11 位号码行，
    // 命中后就地升级为带国家号形态，保证两种登录方式匹配到同一用户。
    let user = await adapter.findOne({
      model: 'user',
      where: [{ field: 'phoneNumber', value: phone }]
    }) as WechatUserRow | null

    if (!user) {
      const legacyPhone = normalizePhoneNumber(phone)
      if (legacyPhone && legacyPhone !== phone) {
        const legacy = await adapter.findOne({
          model: 'user',
          where: [{ field: 'phoneNumber', value: legacyPhone }]
        }) as WechatUserRow | null
        if (legacy) {
          user = await internalAdapter.updateUser(legacy.id, {
            phoneNumber: phone,
            phoneNumberVerified: true
          }) as WechatUserRow
        }
      }
    }

    // 邮箱本地部分只用数字（去掉 '+'），展示名用裸号码
    const emailLocal = phone.replace(/\D/g, '')
    const displayName = normalizePhoneNumber(phone) ?? phone

    if (!user) {
      user = await internalAdapter.createUser(
        {
          email: `${emailLocal}${TEMP_EMAIL_SUFFIX}`,
          name: displayName,
          phoneNumber: phone,
          phoneNumberVerified: true
        },
        { method: 'wechat-phone' }
      )
    } else if (!user.phoneNumberVerified) {
      user = await internalAdapter.updateUser(user.id, { phoneNumberVerified: true })
    }

    if (user?.banned) {
      throw new APIError('FORBIDDEN', { message: '账号已被停用' })
    }
    if (!user) {
      throw new APIError('INTERNAL_SERVER_ERROR', { message: '创建或读取用户失败' })
    }

    const session = await internalAdapter.createSession(user.id)
    if (!session) {
      throw new APIError('INTERNAL_SERVER_ERROR', { message: '创建会话失败' })
    }

    type SessionCookieUser = Parameters<typeof setSessionCookie>[1]['user']
    await setSessionCookie(ctx, { session, user: user as unknown as SessionCookieUser })
    return ctx.json({ token: session.token, user })
  }
)

/** better-auth 插件：挂到 betterAuth({ plugins: [...] })。 */
export function wechatPhone() {
  return {
    id: 'wechat-phone',
    endpoints: {
      wechatPhoneSignIn
    }
  }
}
