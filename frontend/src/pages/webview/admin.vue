<script lang="ts" setup>
import { generateOneTimeToken } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getEnvBaseUrl } from '@/utils'

definePage({
  style: {
    navigationBarTitleText: '管理后台',
  },
})

const auth = useAuthStore()

/** web-view 目标地址；null 期间展示 loading，就绪后才挂载 web-view（原生组件会遮挡一切） */
const webSrc = ref<string | null>(null)
const loading = ref(true)

/** 管理后台基址：专用变量优先，回退接口基址（含微信 develop/trial/release 覆写），去掉尾部 /。 */
function resolveAdminBase(): string {
  return (import.meta.env.VITE_ADMIN_WEB_URL || getEnvBaseUrl()).replace(/\/+$/, '')
}

/** 目标后台页面路径：仅允许站内路径（单 '/' 开头，排除 '//' 协议相对 URL），缺省/非法回退 /dashboard。 */
function resolveRedirect(raw?: string): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//'))
    return raw
  return '/dashboard'
}

/**
 * 构建 web-view 目标地址：始终携带一次性票据指向 sso-login 落地页。
 * 会话有效性由后端落地页判断：Cookie 仍有效则直达目标页（不消耗票据），
 * 无 Cookie 或已失效才兑换票据完成免登。
 */
async function buildUrl(redirect: string): Promise<string> {
  const { token } = await generateOneTimeToken()
  // token 放 fragment：不随 HTTP 请求行发送、不进服务端访问日志；落地页处理后 replaceState 清除
  const hash = `ott=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`
  return `${resolveAdminBase()}/sso-login#${hash}`
}

onLoad((options) => {
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  // 入口在「我的」页已按角色隐藏，此处兜底防直接 navigateTo 打开
  if (!auth.isAdmin) {
    uni.showToast({ title: '无访问权限', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  // 进入页面的最后一刻才生成票据，最大化 60s 有效窗口
  buildUrl(resolveRedirect(options?.redirect))
    .then((url) => {
      webSrc.value = url
    })
    .catch(() => {
      // 拦截器已统一 toast；退出本页，用户可重新进入触发生成
      uni.navigateBack()
    })
    .finally(() => {
      loading.value = false
    })
})
</script>

<template>
  <view class="min-h-screen bg-page">
    <!-- web-view 为原生全屏组件，src 未就绪前不要挂载，避免加载到无票据的空白落地页 -->
    <web-view
      v-if="webSrc" :src="webSrc"
    />
    <view v-else-if="loading" class="min-h-screen flex flex-col items-center justify-center gap-3">
      <view class="i-carbon-renew animate-spin text-7 text-primary" />
      <text class="text-4 text-muted">正在准备免登录链接…</text>
    </view>
  </view>
</template>
