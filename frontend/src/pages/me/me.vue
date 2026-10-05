<script lang="ts" setup>
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { maskPhoneNumber } from '@/utils/phone'
import { toLoginPage } from '@/utils/toLoginPage'

// 菜单图标经数据动态绑定，需在此注释占位，确保 UnoCSS 扫描生成对应样式：
// i-carbon-calendar i-carbon-star i-carbon-notification
// i-carbon-security i-carbon-locked i-carbon-chat i-carbon-information

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

interface MeMenuItem {
  key: string
  label: string
  icon: string
  /** 已上线页面地址；缺省表示功能开发中，点击仅提示 */
  url?: string
  /** tabbar 页必须用 switchTab 跳转 */
  tabbar?: boolean
  /** 红点预留：接入消息接口后按未读数开启 */
  dot?: boolean
}

const auth = useAuthStore()
const loggingOut = ref(false)

// 菜单分组（仅「关于桐乡武协」已落地，其余为标准模板预留入口）
const menuGroups: MeMenuItem[][] = [
  [
    { key: 'activities', label: '活动报名', icon: 'i-carbon-calendar' },
    { key: 'favorites', label: '我的收藏', icon: 'i-carbon-star' },
    { key: 'notifications', label: '消息通知', icon: 'i-carbon-notification', dot: false },
  ],
  [
    { key: 'security', label: '账号与安全', icon: 'i-carbon-security' },
    { key: 'privacy', label: '隐私设置', icon: 'i-carbon-locked' },
  ],
  [
    { key: 'feedback', label: '意见反馈', icon: 'i-carbon-chat' },
    { key: 'about', label: '关于桐乡武协', icon: 'i-carbon-information', url: '/pages/about/about', tabbar: true },
  ],
]

// 副标题优先展示脱敏手机号，其次邮箱
const subtitle = computed(() =>
  maskPhoneNumber(auth.user?.phoneNumber) || auth.user?.email || '',
)
const avatarUrl = computed(() =>
  resolveMediaUrl(auth.user?.image) || '/static/images/default-avatar.png',
)

// 本页允许游客浏览，不做登录守卫；仅在点击需要登录的入口时引导

function handleMenuTap(item: MeMenuItem) {
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!item.url) {
    uni.showToast({ title: '功能开发中', icon: 'none' })
    return
  }
  if (item.tabbar)
    uni.switchTab({ url: item.url })
  else
    uni.navigateTo({ url: item.url })
}

// 资料卡：已登录进入个人信息编辑页，游客点击主动去登录
function handleCardTap() {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  uni.navigateTo({ url: '/pages/me/profile' })
}

async function handleLogout() {
  if (loggingOut.value)
    return
  loggingOut.value = true
  await auth.logout()
  loggingOut.value = false
  uni.reLaunch({ url: '/pages/login/index' })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-gray-50 px-3 pt-3">
    <!-- 资料卡：已登录进入个人信息编辑页，游客点击主动去登录 -->
    <view class="flex items-center rounded-3 bg-white p-4 shadow-sm" hover-class="bg-gray-50" @click="handleCardTap">
      <image :src="avatarUrl" class="h-14 w-14 rounded-full bg-gray-100" />
      <view class="ml-4">
        <template v-if="auth.user">
          <view class="flex items-center">
            <text class="text-5 text-gray-900 font-semibold">
              {{ auth.user.name }}
            </text>
            <text v-if="auth.isAdmin" class="ml-2 rounded bg-green-100 px-2 py-0.5 text-3 text-green-700">
              管理员
            </text>
          </view>
          <view v-if="subtitle" class="mt-1 text-3.5 text-gray-400">
            {{ subtitle }}
          </view>
        </template>
        <view v-else>
          <view class="text-5 text-gray-900 font-semibold">
            点击登录
          </view>
          <view class="mt-1 text-3.5 text-gray-400">
            登录后体验更多功能
          </view>
        </view>
      </view>
      <view class="i-carbon-chevron-right ml-auto text-5 text-gray-300" />
    </view>

    <!-- 菜单分组 -->
    <view v-for="(group, gi) in menuGroups" :key="gi" class="mt-3 overflow-hidden rounded-3 bg-white shadow-sm">
      <view
        v-for="(item, ii) in group" :key="item.key" class="flex items-center px-4 py-3"
        :class="ii > 0 ? 'border-t border-gray-100' : ''" hover-class="bg-gray-50" @click="handleMenuTap(item)"
      >
        <view class="h-8 w-8 center rounded-lg bg-gray-100 text-gray-600">
          <view class="text-4" :class="item.icon" />
        </view>
        <text class="ml-3 text-4 text-gray-800">{{ item.label }}</text>
        <view class="ml-auto flex items-center">
          <view v-if="item.dot" class="mr-2 h-2 w-2 rounded-full bg-red-500" />
          <view class="i-carbon-chevron-right text-4 text-gray-300" />
        </view>
      </view>
    </view>

    <view class="m-8">
      <button
        v-if="auth.isLoggedIn" :loading="loggingOut"
        class="h-11 border border-red-200 rounded-2 bg-white text-4 text-red-500" @click="handleLogout"
      >
        退出登录
      </button>
    </view>
  </view>
</template>
