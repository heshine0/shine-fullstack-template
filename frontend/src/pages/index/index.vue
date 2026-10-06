<script lang="ts" setup>
defineOptions({
  name: 'Home',
})
definePage({
  // 使用 type: "home" 属性设置首页，其他页面不需要设置，默认为page
  type: 'home',
  style: {
    navigationBarTitleText: '首页',
  },
})
</script>

<template>
  <view class="min-h-screen flex flex-col items-center justify-center bg-white px-6">
    <image src="/static/logo.svg" alt="" class="mb-4 h-28 w-28" />
    <view class="text-center text-5 text-gray-900 font-semibold">
      桐乡武协
    </view>
  </view>
</template>
