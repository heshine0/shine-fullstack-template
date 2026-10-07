<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '关于',
  },
})
</script>

<template>
  <view class="min-h-screen bg-page p-4">
    <view class="mb-5 text-center text-lg text-ink font-semibold">
      关于页面
    </view>

    <!-- wot-ui v2 冒烟示例：颜色应跟随 当前浅/深 × 品牌 主题。
         v2 用 variant 控制变体（base/plain/dashed/soft/subtle/text），已无 v1 的 plain 布尔属性 -->
    <view class="flex flex-col gap-3">
      <wd-button type="primary">
        主要按钮
      </wd-button>
      <wd-button type="primary" variant="plain">
        描边按钮
      </wd-button>
      <wd-button type="primary" variant="soft">
        柔和按钮
      </wd-button>
      <wd-button type="danger">
        危险按钮
      </wd-button>

      <!-- tag variant: light 浅底主色字 / dark 实心 / plain 透明描边 -->
      <view class="mt-2 flex flex-wrap items-center gap-2">
        <wd-tag type="primary" variant="light">
          浅色标签
        </wd-tag>
        <wd-tag type="primary" variant="dark">
          实心标签
        </wd-tag>
        <wd-tag type="primary" variant="plain">
          描边标签
        </wd-tag>
        <wd-tag type="success" variant="light">
          成功
        </wd-tag>
        <wd-tag type="danger" variant="light">
          危险
        </wd-tag>
      </view>
    </view>
  </view>
</template>
