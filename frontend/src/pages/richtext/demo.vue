<script lang="ts" setup>
import { openRichEditor } from '@/composables/useRichEditor'

definePage({
  style: {
    navigationBarTitleText: '富文本演示',
  },
})

usePageTitle('富文本演示')

interface ViewerError {
  source?: string
  attrs?: Record<string, unknown>
  errMsg?: string
}

const tips = [
  '点击「编辑内容」按钮进入富文本编辑器（WebView 加载后端编辑器页）。',
  '编辑器支持图片、视频、音频上传（走 COS 直传），以及全部文本样式与列表。',
  '编辑完成后点击「完成」按钮，内容自动同步回本页预览区。',
  '链接仅允许 http(s)/mailto/tel，预览区点击外链：H5 新标签打开，小程序端复制后到浏览器打开。',
]

// 初始内容覆盖排版能力；媒体留空由用户自行插入，避免引用失效外链
const initialHtml = [
  '<h3>富文本能力演示</h3>',
  '<p>这是一段示例文字，演示 <strong>粗体</strong>、<em>斜体</em>、<u>下划线</u> 与 <span style="color:#16a34a">彩色文字</span>。</p>',
  '<p>无序列表：</p>',
  '<ul><li>图文混排</li><li>音视频播放</li><li>链接管理</li></ul>',
  '<p>有序列表：</p>',
  '<ol><li>点击编辑按钮进入编辑器</li><li>在 WebView 中编辑内容</li><li>完成后同步回预览</li></ol>',
  '<p><a href="https://mp-html.pages.dev/">点此访问 mp-html 文档（外链示例）</a></p>',
].join('')

const html = ref(initialHtml)
const editing = ref(false)

const charCount = computed(() => html.value.length)

const SOURCE_LABEL: Record<string, string> = {
  img: '图片',
  video: '视频',
  audio: '音频',
}

async function onEdit() {
  editing.value = true
  const result = await openRichEditor({ initial: html.value })
  editing.value = false
  if (result) {
    html.value = result.html
    uni.showToast({ title: '内容已更新', icon: 'success' })
  }
}

function onViewerError(detail: ViewerError) {
  const label = (detail.source && SOURCE_LABEL[detail.source]) || '媒体'
  uni.showToast({ title: `${label}加载失败`, icon: 'none' })
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- 操作指引 -->
    <view class="border border-line rounded-xl bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <view class="i-carbon-information text-5 text-primary" />
        <text class="ml-2 text-4 text-ink font-medium">操作指引</text>
      </view>
      <view v-for="(tip, i) in tips" :key="i" class="mt-2.5 flex items-start">
        <view class="text-primary-soft-text mr-2.5 mt-0.5 h-5 w-5 center shrink-0 rounded-full bg-primary-soft text-3">
          {{ i + 1 }}
        </view>
        <text class="flex-1 text-3.5 text-muted leading-5">{{ tip }}</text>
      </view>
    </view>

    <!-- 预览区 -->
    <view class="mt-4">
      <view class="mb-2 flex items-baseline justify-between px-1">
        <text class="text-4 text-ink font-medium">预览区</text>
        <text class="text-3 text-muted">{{ charCount }} 字符</text>
      </view>
      <view class="border border-line rounded-xl bg-card p-4">
        <rich-viewer :content="html" @error="onViewerError" />
      </view>
    </view>

    <!-- 编辑按钮（view 模拟，规避原生 button 跨端默认样式） -->
    <view
      class="mt-4 flex items-center justify-center rounded-xl bg-primary py-3 text-4 text-white"
      :class="{ 'opacity-50': editing }"
      @tap="!editing && onEdit()"
    >
      <view v-if="editing" class="i-carbon-renew mr-2 animate-spin text-4" />
      <text>{{ editing ? '编辑中…' : '编辑内容' }}</text>
    </view>
  </view>
</template>
