<script lang="ts" setup>
import { useAuthStore } from '@/store/auth'

definePage({
  style: {
    navigationBarTitleText: '登录',
  },
})

const auth = useAuthStore()

// 本地联调预填初始管理员账号（生产请勿预填）
const email = ref('admin@tongxiangwuxie.local')
const password = ref('Admin12345')
const submitting = ref(false)

// 已登录用户进入登录页时直接回首页
onShow(() => {
  if (auth.isLoggedIn) {
    uni.reLaunch({ url: '/pages/index/index' })
  }
})

async function handleSubmit() {
  if (submitting.value)
    return
  if (!email.value || !password.value) {
    uni.showToast({ title: '请输入邮箱和密码', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    await auth.login({ email: email.value.trim(), password: password.value })
    uni.showToast({ title: '登录成功', icon: 'success' })
    uni.reLaunch({ url: '/pages/index/index' })
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="min-h-screen flex flex-col justify-center bg-gray-50 px-8 pt-safe">
    <view class="mb-8 text-center">
      <view class="text-6 text-gray-900 font-bold">
        桐乡武协
      </view>
      <view class="mt-2 text-3.5 text-gray-400">
        请登录以继续
      </view>
    </view>

    <view class="rounded-3 bg-white p-6 shadow-sm">
      <view class="mb-4">
        <view class="mb-2 text-3.5 text-gray-600">
          邮箱
        </view>
        <input
          v-model="email"
          type="text"
          placeholder="请输入邮箱"
          class="h-11 border border-gray-200 rounded-2 px-3 text-4"
        >
      </view>

      <view class="mb-6">
        <view class="mb-2 text-3.5 text-gray-600">
          密码
        </view>
        <input
          v-model="password"
          password
          placeholder="请输入密码"
          class="h-11 border border-gray-200 rounded-2 px-3 text-4"
        >
      </view>

      <button
        :loading="submitting"
        class="h-11 rounded-2 bg-green-600 text-4 text-white"
        @click="handleSubmit"
      >
        登录
      </button>
    </view>
  </view>
</template>
