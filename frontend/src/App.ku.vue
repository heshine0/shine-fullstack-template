<script setup lang="ts">
import { ref } from 'vue'
import FgTabbar from '@/tabbar/index.vue'
import { useThemeStore } from '@/store/theme'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'

// 全局主题：根节点 class 承载 CSS 变量作用域（小程序/App 靠变量继承生效，H5 另同步 html）
const themeStore = useThemeStore()

const isCurrentPageTabbar = ref(true)
onShow(() => {
  const { path } = currRoute()
  // “蜡笔小开心”提到本地是 '/pages/index/index'，线上是 '/' 导致线上 tabbar 不见了
  // 所以这里需要判断一下，如果是 '/' 就当做首页，也要显示 tabbar
  if (path === '/') {
    isCurrentPageTabbar.value = true
  }
  else {
    isCurrentPageTabbar.value = isPageTabbar(path)
  }
})

const helloKuRoot = ref('Hello AppKuVue')

const exposeRef = ref('this is form app.Ku.vue')

defineExpose({
  exposeRef,
})
</script>

<template>
  <view :class="themeStore.rootClass" class="min-h-screen bg-page">
    <!-- 这个先隐藏了，知道这样用就行 -->
    <view class="hidden text-center">
      {{ helloKuRoot }}，这里可以配置全局的东西
    </view>

    <KuRootView />

    <FgTabbar v-if="isCurrentPageTabbar" />
  </view>
</template>
