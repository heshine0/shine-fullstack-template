import type { AuthUser, LoginForm } from '@/api/auth'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import * as profileApi from '@/api/profile'
// #ifndef H5
import { cookieJar } from '@/http/cookie-jar'
// #endif

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

    /** 手机号 + 短信验证码登录（用户不存在时后端自动注册），随后补全用户信息。 */
    async function loginByPhoneOtp(phone: string, code: string): Promise<AuthUser> {
      await authApi.loginWithPhoneOtp(phone, code)
      return await fetchMe()
    }

    /** 微信小程序「获取手机号」一键登录，随后补全用户信息。 */
    async function loginByWechat(phoneCode: string): Promise<AuthUser> {
      await authApi.loginWithWechatPhone(phoneCode)
      return await fetchMe()
    }

    /** 更新昵称，成功后重新拉取用户信息保持本地一致。 */
    async function updateName(name: string): Promise<void> {
      await profileApi.updateMyProfile({ name })
      await fetchMe()
    }

    /** 换绑手机号（OTP 已在页面侧校验发送），成功后刷新用户信息。 */
    async function changePhone(phone: string, code: string): Promise<void> {
      await profileApi.verifyChangePhone(phone, code)
      await fetchMe()
    }

    /** 上传头像文件并写入资料，成功后刷新用户信息。 */
    async function updateAvatar(filePath: string): Promise<void> {
      const url = await profileApi.uploadAvatar(filePath)
      await profileApi.updateMyProfile({ image: url })
      await fetchMe()
    }

    /** 以已上传完成的媒体 URL 写入头像，成功后刷新用户信息。 */
    async function setAvatar(url: string): Promise<void> {
      await profileApi.updateMyProfile({ image: url })
      await fetchMe()
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

    /** 仅清空本地用户（401 拦截等场景）；小程序端同时清空本地 cookie jar。 */
    function clear() {
      user.value = null
      // #ifndef H5
      cookieJar.clear()
      // #endif
    }

    return {
      user,
      isLoggedIn,
      isAdmin,
      fetchMe,
      login,
      loginByPhoneOtp,
      loginByWechat,
      updateName,
      changePhone,
      updateAvatar,
      setAvatar,
      logout,
      clear,
    }
  },
  {
    // pinia-plugin-persistedstate：以 uni storage 持久化 user
    persist: true,
  },
)
