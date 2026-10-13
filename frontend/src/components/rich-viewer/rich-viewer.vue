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
  // H5 + Vue3 下 mp-html 不上报 errMsg，故为可选
  errMsg?: string
}

withDefaults(defineProps<{
  content?: string
  emptyText?: string
}>(), {
  content: '',
  emptyText: '暂无内容',
})

const emit = defineEmits<{
  error: [detail: ErrorDetail]
}>()

const mpRef = ref<any>(null)

// tag-style：仅约束媒体宽度与链接主色，其余排版走 mp-html 默认样式
const TAG_STYLE: Record<string, string> = {
  img: 'max-width:100%',
  video: 'width:100%',
  a: 'color:var(--c-primary)',
}

// 不同平台/编译形态下模板 ref 的实例位置不同，多重兜底
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
  // #锚点：use-anchor 已让组件内部滚动定位
  if (href.startsWith('#'))
    return
  // 无协议的站内相对链接：组件内部自动 uni.navigateTo，不拦截
  if (!SCHEME_RE.test(href))
    return
  // 编辑器侧已做白名单，这里再兜底：javascript: 等非法协议一律忽略
  if (!EXTERNAL_OK_RE.test(href))
    return
  // #ifdef H5
  // noopener 防止新页面通过 window.opener 反向操作当前页（tab-nabbing）
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

// MP 端页面跳转只 hide 不卸载，需主动停播；H5 路由切走则由 unmounted 覆盖
onHide(() => pauseMedia())
onUnmounted(() => pauseMedia())

defineExpose({ pauseMedia })
</script>

<template>
  <view class="rich-viewer">
    <mp-html
      v-if="content"
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
