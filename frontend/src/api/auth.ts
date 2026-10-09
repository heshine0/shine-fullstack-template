import { http } from '@/http/alova'

/** 当前登录用户（与后端 GET /api/me 的 data 对齐）。 */
export interface AuthUser {
  id: string
  name: string
  email: string
  image?: string | null
  emailVerified?: boolean
  phoneNumber?: string | null
  phoneNumberVerified?: boolean
  banned?: boolean
  /** 角色名列表，授权判据为是否包含 'admin'。 */
  roles: string[]
  createdAt: string
  updatedAt?: string
}

export interface LoginForm {
  email: string
  password: string
}

/**
 * Better Auth 邮箱密码登录。
 * 原生端点 POST /api/auth/sign-in/email：成功返回 user，并通过 Set-Cookie 写入会话。
 * 标记 rawAuth，响应拦截器不按 { code:'OK' } 包装解析。
 */
export function login(data: LoginForm): Promise<AuthUser> {
  return http.Post('/auth/sign-in/email', data, {
    meta: { rawAuth: true },
  }) as unknown as Promise<AuthUser>
}

/** Better Auth 退出登录：POST /api/auth/sign-out，清除服务端会话 Cookie。 */
export function logout(): Promise<unknown> {
  return http.Post('/auth/sign-out', {}, {
    meta: { rawAuth: true },
  }) as unknown as Promise<unknown>
}

/**
 * 发送短信验证码：POST /api/auth/phone-number/send-otp（better-auth phoneNumber 插件）。
 * 开发期验证码只打印在后端日志中。
 */
export function sendPhoneOtp(phone: string): Promise<{ message: string }> {
  return http.Post('/auth/phone-number/send-otp', { phoneNumber: phone }, {
    meta: { rawAuth: true },
  }) as unknown as Promise<{ message: string }>
}

/**
 * 手机号验证码登录：POST /api/auth/phone-number/verify。
 * 校验通过后后端自动建会话并 Set-Cookie；用户不存在时按配置自动注册。
 */
export function loginWithPhoneOtp(phone: string, code: string): Promise<unknown> {
  return http.Post('/auth/phone-number/verify', { phoneNumber: phone, code }, {
    meta: { rawAuth: true },
  }) as unknown as Promise<unknown>
}

/**
 * 微信小程序「获取手机号」一键登录：POST /api/auth/wechat/phone-sign-in。
 * @param phoneCode button open-type="getPhoneNumber" 回调中的 e.detail.code；
 *                  后端 mock 模式下约定为 'mock:<手机号>'
 */
export function loginWithWechatPhone(phoneCode: string): Promise<unknown> {
  return http.Post('/auth/wechat/phone-sign-in', { phoneCode }, {
    meta: { rawAuth: true },
  }) as unknown as Promise<unknown>
}

/**
 * 生成 web-view 免登录一次性票据：GET /api/auth/one-time-token/generate。
 * Better Auth one-time-token 插件：需携带当前会话 Cookie，返回 60s 有效的一次性 token
 * （服务端只存 SHA-256）；供小程序拼进后台 /sso-login 落地页 URL 兑换 Cookie 会话。
 */
export function generateOneTimeToken(): Promise<{ token: string }> {
  return http.Get('/auth/one-time-token/generate', {
    meta: { rawAuth: true },
  }) as unknown as Promise<{ token: string }>
}

/**
 * 获取当前登录用户（GET /api/me，拦截器已解包 data，含 roles）。
 * @param silent 静默模式：401 时不弹提示、不跳转登录页（用于启动时探测会话）。
 */
export function getMe(silent = false): Promise<AuthUser> {
  const config = silent
    ? { meta: { skipAuthRedirect: true, toast: false } }
    : undefined
  return http.Get<AuthUser>('/me', config) as unknown as Promise<AuthUser>
}
