<script lang="ts" setup>
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
  '工具栏可插入文本、图片、视频、音频、链接与有序/无序列表，并支持撤销、重做、清空。',
  '点击任意内容块弹出菜单，可设置加粗、斜体、下划线、字号、颜色、居中、缩进或删除；点文字可直接修改。',
  '预览区实时同步编辑内容；图片、音视频走 COS 直传（需登录），音视频可在预览区播放。',
  '链接仅允许 http(s)/mailto/tel，预览区点击外链：H5 新标签打开，小程序端复制后到浏览器打开。',
]

// 初始内容覆盖排版能力；媒体留空由用户自行插入，避免引用失效外链
const initialHtml = [
  '<h3>富文本能力演示</h3>',
  '<p>这是一段示例文字，演示 <span style="font-weight:bold">粗体</span>、<span style="font-style:italic">斜体</span>、<span style="text-decoration:underline">下划线</span> 与 <span style="color:#16a34a">彩色文字</span>。</p>',
  '<p>无序列表：</p>',
  '<ul><li>图文混排</li><li>音视频播放</li><li>链接管理</li></ul>',
  '<p>有序列表：</p>',
  '<ol><li>点击工具栏插入内容</li><li>点内容块弹出样式菜单</li><li>预览区实时同步</li></ol>',
  '<p><a href="https://mp-html.pages.dev/">点此访问 mp-html 文档（外链示例）</a></p>',
].join('')

const html = ref(initialHtml)

const charCount = computed(() => html.value.length)

const SOURCE_LABEL: Record<string, string> = {
  img: '图片',
  video: '视频',
  audio: '音频',
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

    <!-- 宽屏左右双栏，窄屏上下堆叠 -->
    <view class="mt-4 flex flex-col gap-4 lg:flex-row">
      <!-- 编辑区 -->
      <view class="min-w-0 flex flex-1 flex-col">
        <view class="mb-2 flex items-baseline justify-between px-1">
          <text class="text-4 text-ink font-medium">编辑区</text>
        </view>
        <rich-editor v-model="html" />
      </view>

      <!-- 预览区 -->
      <view class="min-w-0 flex flex-1 flex-col">
        <view class="mb-2 flex items-baseline justify-between px-1">
          <text class="text-4 text-ink font-medium">预览区</text>
          <text class="text-3 text-muted">预览已同步 · {{ charCount }} 字符</text>
        </view>
        <view class="flex-1 border border-line rounded-xl bg-card p-4">
          <rich-viewer :content="html" @error="onViewerError" />
        </view>
      </view>
    </view>
  </view>
</template>
