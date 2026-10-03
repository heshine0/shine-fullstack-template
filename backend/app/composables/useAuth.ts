/** 当前登录用户（/api/me 返回结构）。 */
export interface AuthUser {
  id: string
  name: string
  email: string
  image: string | null
  emailVerified: boolean
  phoneNumber: string | null
  phoneNumberVerified: boolean
  roles: string[]
  createdAt: string
}

interface MeResponse {
  code: 'OK'
  data: AuthUser
}

/**
 * 会话状态（SSR 安全）。
 * - 服务端：携带请求 Cookie 访问绝对地址 /api/me
 * - 客户端：同源 credentials 携带 Cookie
 */
export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const fetched = useState<boolean>('auth-fetched', () => false)

  const isAdmin = computed(() => !!user.value?.roles.includes('admin'))

  async function fetchMe(force = false): Promise<AuthUser | null> {
    if (fetched.value && !force) return user.value
    try {
      let res: MeResponse
      if (import.meta.server) {
        res = await $fetch<MeResponse>('/api/me', {
          baseURL: useRequestURL().origin,
          headers: useRequestHeaders(['cookie'])
        })
      } else {
        res = await $fetch<MeResponse>('/api/me', { credentials: 'include' })
      }
      user.value = res.data
    } catch {
      user.value = null
    } finally {
      fetched.value = true
    }
    return user.value
  }

  function reset() {
    user.value = null
    fetched.value = false
  }

  async function logout() {
    await $fetch('/api/auth/sign-out', { method: 'POST', body: {}, credentials: 'include' }).catch(() => {})
    reset()
    await navigateTo('/login', { replace: true })
  }

  return { user, isAdmin, fetchMe, reset, logout }
}
