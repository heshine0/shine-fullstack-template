<script setup lang="ts">
import { useAuthStore } from '@/store/auth'
import { isPageTabbar } from '@/tabbar/store'
import { HOME_PAGE } from '@/utils'
import { toLoginPage } from '@/utils/toLoginPage'
import { systemInfo } from '@/utils/systemInfo'

defineOptions({
  name: 'LayoutDefault',
})

/** 导航栏内容区高度（不含状态栏），小程序/H5 通用标准 44px */
const NAV_BAR_HEIGHT = 44
const statusBarHeight = systemInfo.statusBarHeight ?? 0
/** fixed 头部总高度，用于内容区顶部占位与弹层定位 */
const headerTotalHeight = statusBarHeight + NAV_BAR_HEIGHT

const auth = useAuthStore()

/**
 * 页面路径 → 标题。
 * 需与各页 definePage 的 style.navigationBarTitleText 保持同步。
 */
const PAGE_TITLES: Record<string, string> = {
  '/pages/index/index': '首页',
  '/pages/about/about': '关于',
  '/pages/login/index': '登录',
  '/pages/me/me': '我的',
  '/pages/me/profile': '个人信息',
}

// 当前页标题与是否为 tab 页：布局组件随页面创建而挂载，onMounted 中读取页面栈即可
const title = ref('')
const isTab = ref(false)

function syncCurrentPage() {
  const pages = getCurrentPages()
  const last = pages[pages.length - 1]
  if (!last)
    return
  const path = `/${last.route}`
  title.value = PAGE_TITLES[path] || ''
  isTab.value = isPageTabbar(path)
}

onMounted(() => {
  syncCurrentPage()
})

// —— 三条线弹出菜单 ——
const menuOpen = ref(false)

function openMenu() {
  syncCurrentPage()
  menuOpen.value = true
}

function closeMenu() {
  menuOpen.value = false
}

/** tab 页最左侧图标：回首页 */
function goHome() {
  uni.switchTab({ url: HOME_PAGE })
}

/** 用户图标：进「我的」tab */
function goMe() {
  uni.switchTab({ url: '/pages/me/me' })
}

/** 非 tab 页最左侧图标：优先返回上一页，页面栈仅有当前页时（如分享直达）兜底回首页 */
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1)
    uni.navigateBack({ delta: 1 })
  else
    uni.switchTab({ url: HOME_PAGE })
}

interface HeaderMenuItem {
  key: string
  label: string
  /** 完整 UnoCSS 图标类名（静态写死，确保被扫描生成） */
  icon: string
  danger?: boolean
  action: () => void
}

function showComingSoon() {
  closeMenu()
  uni.showToast({ title: '功能开发中', icon: 'none' })
}

function switchTabFromMenu(url: string) {
  closeMenu()
  uni.switchTab({ url })
}

async function handleLogout() {
  closeMenu()
  await auth.logout()
  uni.reLaunch({ url: '/pages/login/index' })
}

const menuItems: HeaderMenuItem[] = [
  { key: 'home', label: '首页', icon: 'i-carbon-home', action: () => switchTabFromMenu('/pages/index/index') },
  { key: 'activities', label: '活动报名', icon: 'i-carbon-calendar', action: showComingSoon },
  { key: 'favorites', label: '我的收藏', icon: 'i-carbon-star', action: showComingSoon },
  { key: 'notifications', label: '消息通知', icon: 'i-carbon-notification', action: showComingSoon },
  { key: 'about', label: '关于桐乡武协', icon: 'i-carbon-information', action: () => switchTabFromMenu('/pages/about/about') },
  { key: 'logout', label: '退出登录', icon: 'i-carbon-logout', danger: true, action: () => void handleLogout() },
]
</script>

<template>
  <view class="min-h-screen flex flex-col">
    <!-- 自定义头部导航栏 -->
    <view class="fixed left-0 right-0 top-0 z-[999] border-b border-gray-200 bg-white">
      <!-- 状态栏占位 -->
      <view :style="{ height: `${statusBarHeight}px` }" />
      <!-- 导航栏：左侧操作区 + 右侧标题 -->
      <view class="h-44px flex items-center justify-between px-3">
        <view class="flex items-center gap-2">
          <!-- tab 页：主页图标；非 tab 页：返回图标 -->
          <view v-if="isTab" class="h-8 w-8 center rounded-full bg-gray-50 text-gray-600" @click="goHome">
            <view class="i-carbon-home text-4" />
          </view>
          <view v-else class="h-8 w-8 center rounded-full bg-gray-50 text-gray-600" @click="goBack">
            <view class="i-carbon-arrow-left text-4" />
          </view>

          <!-- 游客：登录按钮；已登录：用户图标 + 三条线 -->
          <view
            v-if="!auth.isLoggedIn"
            class="rounded-full bg-green-50 px-3 py-1 text-3.5 text-green-700 font-medium"
            @click="toLoginPage()"
          >
            登录
          </view>
          <template v-else>
            <view class="h-8 w-8 center rounded-full bg-gray-50 text-gray-600" @click="goMe">
              <view class="i-carbon-user text-4" />
            </view>
            <view class="h-8 w-8 center rounded-full bg-gray-50 text-gray-600" @click="showComingSoon">
              <view class="i-carbon-notification text-4" />
            </view>
            <view class="h-8 w-8 center rounded-full bg-gray-50 text-gray-600" @click="openMenu">
              <view class="i-carbon-menu text-4" />
            </view>
          </template>
        </view>

        <!-- 右部分：标题 -->
        <text class="ml-10 flex-1 text-4 text-gray-900 font-medium">{{ title }}</text>
      </view>
    </view>

    <!-- 页面内容：为 fixed 头部留出高度 -->
    <view :style="{ paddingTop: `${headerTotalHeight}px` }">
      <slot />
    </view>

    <!-- 三条线弹出菜单：透明遮罩 + 下拉卡片 -->
    <template v-if="menuOpen">
      <view class="fixed inset-0 z-[1001]" @click="closeMenu" />
      <view
        class="fixed left-3 z-[1002] w-130 overflow-hidden rounded-3 bg-white shadow-lg"
        :style="{ top: `${headerTotalHeight + 4}px` }"
      >
        <view
          v-for="(item, index) in menuItems" :key="item.key"
          class="flex items-center px-4 py-2.5 text-3.5"
          :class="[
            index > 0 ? 'border-t border-gray-100' : '',
            item.danger ? 'bg-red-50 text-red-500' : 'text-gray-800',
          ]"
          @click="item.action"
        >
          <view :class="item.icon" class="text-4" />
          <text class="ml-2">{{ item.label }}</text>
        </view>
      </view>
    </template>
  </view>
</template>
