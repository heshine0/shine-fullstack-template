<script setup lang="ts">
import { onHide } from '@dcloudio/uni-app'

/**
 * 富文本只读渲染器（mp-html 封装）。
 *
 * - content 响应式，更新即重新解析渲染；
 * - 外链：H5 以 noopener 新标签打开，非 H5 复制链接提示浏览器打开；
 * - #锚点与站内相对链接交由 mp-html 内部处理（滚动 / uni.navigateTo）；
 * - 页面隐藏或组件卸载时暂停音视频播放。
 */
interface ErrorDetail {
  source?: string
  attrs?: Record<string, unknown>
  errMsg?: string
}

const props = withDefaults(defineProps<{
  content?: string
  emptyText?: string
}>(), {
  content: '',
  emptyText: '暂无内容',
})

const emit = defineEmits<{
  error: [detail: ErrorDetail]
}>()

// mp-html 2.x（options API）在 uni-app Vue3 H5 下动态 setContent
// 会因节点树错位抛 "Cannot read properties of undefined (reading 'style')"；
// content 变化时通过 key 强制整体重建，走全新挂载解析路径。
const viewerKey = ref(0)
watch(() => props.content, () => {
  viewerKey.value += 1
})

const mpRef = ref<any>(null)

const TAG_STYLE: Record<string, string> = {
  img: 'max-width:100%',
  video: 'width:100%',
  a: 'color:var(--c-primary)',
}

function getCtx(): any {
  const r = mpRef.value
  if (!r)
    return null
  if (typeof r.pauseMedia === 'function')
    return r
  const ctx = r.$vm ?? r.context ?? r
  return typeof ctx?.pauseMedia === 'function' ? ctx : null
}

function pauseMedia() {
  getCtx()?.pauseMedia()
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const EXTERNAL_OK_RE = /^(?:https?:|mailto:|tel:)/i

function onLinkTap(attrs: Record<string, unknown> | undefined) {
  const href = String(attrs?.href || '').trim()
  if (!href)
    return
  if (href.startsWith('#'))
    return
  if (!SCHEME_RE.test(href))
    return
  if (!EXTERNAL_OK_RE.test(href))
    return
  // #ifdef H5
  window.open(href, '_blank', 'noopener')
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: href,
    success: () => uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }),
  })
  // #endif
}

function onError(detail: ErrorDetail) {
  emit('error', detail)
}

onHide(() => pauseMedia())
onUnmounted(() => pauseMedia())

defineExpose({ pauseMedia })
</script>

<template>
  <view class="rich-viewer">
    <mp-html
      v-if="content"
      :key="viewerKey"
      ref="mpRef"
      :content="content"
      :use-anchor="true"
      preview-img="all"
      :copy-link="false"
      :pause-video="true"
      :tag-style="TAG_STYLE"
      @linktap="onLinkTap"
      @error="onError"
    />
    <view v-else class="px-3 py-8 text-center text-sm text-muted">
      {{ emptyText }}
    </view>
  </view>
</template>
