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
 * 获取当前登录用户（GET /api/me，拦截器已解包 data，含 roles）。
 * @param silent 静默模式：401 时不弹提示、不跳转登录页（用于启动时探测会话）。
 */
export function getMe(silent = false): Promise<AuthUser> {
  const config = silent
    ? { meta: { skipAuthRedirect: true, toast: false } }
    : undefined
  return http.Get<AuthUser>('/me', config) as unknown as Promise<AuthUser>
}
