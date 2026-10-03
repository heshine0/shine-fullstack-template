import type { AuthUser, LoginForm } from '@/api/auth'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'

/**
 * 登录态存储（Cookie 单通道）。
 * 本地只持久化用户信息（uni storage，key 为 'auth'），不保存任何 token：
 * 会话凭证是后端下发的 HttpOnly Cookie，由请求自动携带。
 */
export const useAuthStore = defineStore(
  'auth',
  () => {
    const user = ref<AuthUser | null>(null)

    const isLoggedIn = computed(() => !!user.value)
    /** 授权判据：role.name === 'admin'（此处以角色名列表表达）。 */
    const isAdmin = computed(() => !!user.value?.roles?.includes('admin'))

    /**
     * 用当前会话 Cookie 拉取用户信息（含 roles），用于启动恢复与登录后补全。
     * @param silent 静默模式：未登录（401）时不提示、不跳转，仅抛出由调用方忽略。
     */
    async function fetchMe(silent = false): Promise<AuthUser> {
      const me = await authApi.getMe(silent)
      user.value = me
      return me
    }

    /** 邮箱密码登录：成功写入会话 Cookie，再拉取含 roles 的完整用户信息。 */
    async function login(form: LoginForm): Promise<AuthUser> {
      await authApi.login(form)
      return await fetchMe()
    }

    /** 退出登录：通知后端清除会话，无论成败都清空本地用户。 */
    async function logout(): Promise<void> {
      try {
        await authApi.logout()
      }
      catch {
        // 即使后端注销失败（如会话已过期）也清空本地态
      }
      finally {
        clear()
      }
    }

    /** 仅清空本地用户（401 拦截等场景）。 */
    function clear() {
      user.value = null
    }

    return {
      user,
      isLoggedIn,
      isAdmin,
      fetchMe,
      login,
      logout,
      clear,
    }
  },
  {
    // pinia-plugin-persistedstate：以 uni storage 持久化 user
    persist: true,
  },
)
