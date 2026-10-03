<script lang="ts" setup>
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

const auth = useAuthStore()
const loggingOut = ref(false)

// 每次进入都校验登录态（持久化已在启动时恢复，这里可同步判断）
onShow(() => {
  if (!auth.isLoggedIn) {
    toLoginPage({ mode: 'reLaunch' })
  }
})

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
  <view class="min-h-screen bg-gray-50 px-6 pt-8">
    <view v-if="auth.user" class="rounded-3 bg-white p-6 shadow-sm">
      <view class="flex items-center">
        <image
          :src="auth.user.image || '/static/images/default-avatar.png'"
          class="h-16 w-16 rounded-full bg-gray-100"
        />
        <view class="ml-4">
          <view class="flex items-center">
            <text class="text-5 text-gray-900 font-semibold">
              {{ auth.user.name }}
            </text>
            <text
              v-if="auth.isAdmin"
              class="ml-2 rounded bg-green-100 px-2 py-0.5 text-3 text-green-700"
            >
              管理员
            </text>
          </view>
          <view class="mt-1 text-3.5 text-gray-400">
            {{ auth.user.email }}
          </view>
        </view>
      </view>

      <view class="mt-5 border-t border-gray-100 pt-4">
        <view class="text-3.5 text-gray-500">
          角色
        </view>
        <view class="mt-1 text-4 text-gray-800">
          {{ auth.user.roles?.join('、') || '—' }}
        </view>
      </view>
    </view>

    <button
      :loading="loggingOut"
      class="mt-8 h-11 border border-red-200 rounded-2 bg-white text-4 text-red-500"
      @click="handleLogout"
    >
      退出登录
    </button>
  </view>
</template>
