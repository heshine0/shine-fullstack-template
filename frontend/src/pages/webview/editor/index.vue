<script lang="ts" setup>
import { generateOneTimeToken } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getEnvBaseUrl } from '@/utils'
import { parseBridgeMessage } from '@/composables/useRichEditor'

definePage({
  style: {
    navigationBarTitleText: '富文本编辑',
  },
})

const auth = useAuthStore()

/** 当前草稿 ID：由 openRichEditor 经页面参数传入，onLoad 时落盘供 buildUrl 闭包读取 */
const draftId = ref('')
const webSrc = ref<string | null>(null)
const loading = ref(true)

function resolveAdminBase(): string {
  return (import.meta.env.VITE_ADMIN_WEB_URL || getEnvBaseUrl()).replace(/\/+$/, '')
}

async function buildUrl(): Promise<string> {
  const { token } = await generateOneTimeToken()
  const redirect = `/rich-editor?draft=${encodeURIComponent(draftId.value)}`
  const hash = `ott=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`
  return `${resolveAdminBase()}/sso-login#${hash}`
}

// H5: iframe 消息监听
// #ifdef H5
function onMessage(event: MessageEvent) {
  // origin 双向校验：只接受编辑器 iframe（后端页）来源的消息
  const allowedOrigin = webSrc.value ? new URL(webSrc.value).origin : null
  if (allowedOrigin && event.origin !== allowedOrigin)
    return
  const msg = parseBridgeMessage(event.data)
  if (!msg)
    return
  if (msg.type === 'done') {
    uni.$emit('rich-editor:done', { draftId: msg.draftId })
    uni.navigateBack()
  }
  else if (msg.type === 'cancel') {
    uni.$emit('rich-editor:cancel')
    uni.navigateBack()
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onMessage)
})
// #endif

// 微信: web-view @message 事件（仅返回时投递）
// #ifndef H5
function onWebviewMessage(e: any) {
  const data = e.detail?.data
  if (!Array.isArray(data))
    return
  // 微信 postMessage 是数组，取最后一条
  const msg = parseBridgeMessage(data[data.length - 1])
  if (!msg)
    return
  if (msg.type === 'done') {
    uni.$emit('rich-editor:done', { draftId: msg.draftId })
    uni.navigateBack()
  }
  else if (msg.type === 'cancel') {
    uni.$emit('rich-editor:cancel')
    uni.navigateBack()
  }
}
// #endif

onLoad((options) => {
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  // 将 draftId 存入页面状态供 buildUrl 使用
  draftId.value = (options as any)?.draftId || ''

  buildUrl()
    .then((url) => {
      webSrc.value = url
    })
    .catch(() => {
      uni.navigateBack()
    })
    .finally(() => {
      loading.value = false
    })
})
</script>

<template>
  <view class="min-h-screen bg-page">
    <!-- #ifdef H5 -->
    <iframe
      v-if="webSrc"
      :src="webSrc"
      class="h-screen w-full border-0"
    />
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <web-view
      v-if="webSrc"
      :src="webSrc"
      @message="onWebviewMessage"
    />
    <!-- #endif -->
    <view v-if="loading" class="min-h-screen flex flex-col items-center justify-center gap-3">
      <view class="i-carbon-renew animate-spin text-7 text-primary" />
      <text class="text-4 text-muted">正在准备免登录链接…</text>
    </view>
  </view>
</template>
