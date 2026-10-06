<script lang="ts" setup>
import type { MediaItem } from '@/api/media'
import { resolveMediaUrl, sendChangePhoneOtp } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'
import { maskPhoneNumber } from '@/utils/phone'

definePage({
  style: {
    navigationBarTitleText: '个人信息',
  },
})

const auth = useAuthStore()

const PHONE_RE = /^1[3-9]\d{9}$/
function normalizePhone(input: string): string {
  return input.replaceAll(/[\s()-]/g, '').replace(/^\+?86/, '')
}

const avatarUrl = computed(() =>
  resolveMediaUrl(auth.user?.image) || '/static/images/default-avatar.png',
)
const phoneText = computed(() => maskPhoneNumber(auth.user?.phoneNumber))

onShow(() => {
  if (!auth.isLoggedIn)
    toLoginPage({ mode: 'reLaunch' })
})

// —— 头像（复用通用媒体上传组件，直传 COS 后写入 image）——
const avatarUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)
const savingAvatar = ref(false)

function chooseAvatar() {
  if (savingAvatar.value)
    return
  avatarUploader.value?.trigger()
}

async function onAvatarChange(items: MediaItem[]) {
  const file = items[0]
  if (!file || file.status !== 'done')
    return
  savingAvatar.value = true
  uni.showLoading({ title: '保存中', mask: true })
  try {
    await auth.setAvatar(file.url)
    uni.showToast({ title: '头像已更新', icon: 'success' })
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    savingAvatar.value = false
    uni.hideLoading()
    avatarUploader.value?.reset()
  }
}

// —— 昵称 ——
function editName() {
  uni.showModal({
    title: '修改昵称',
    editable: true,
    placeholderText: '请输入昵称（1-20 字）',
    content: auth.user?.name ?? '',
    success: (res) => {
      if (!res.confirm)
        return
      const name = (res.content ?? '').trim()
      if (!name) {
        uni.showToast({ title: '昵称不能为空', icon: 'none' })
        return
      }
      if (name.length > 20) {
        uni.showToast({ title: '昵称不能超过 20 字', icon: 'none' })
        return
      }
      if (name === auth.user?.name)
        return
      void doUpdateName(name)
    },
  })
}

async function doUpdateName(name: string) {
  try {
    await auth.updateName(name)
    uni.showToast({ title: '昵称已更新', icon: 'success' })
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
}

// —— 手机号换绑 ——
const editingPhone = ref(false)
const phoneModalVisible = ref(false)
const newPhone = ref('')
const phoneCode = ref('')
const sendingOtp = ref(false)
const submittingPhone = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

function startCountdown() {
  countdown.value = 60
  if (countdownTimer)
    clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

function openPhoneModal() {
  editingPhone.value = true
  nextTick(() => {
    phoneModalVisible.value = true
  })
}

function closePhoneModal() {
  // 提交中不允许误关
  if (submittingPhone.value)
    return
  phoneModalVisible.value = false
  setTimeout(() => {
    editingPhone.value = false
  }, 200)
}

async function handleSendOtp() {
  if (sendingOtp.value || countdown.value > 0)
    return
  const normalized = normalizePhone(newPhone.value)
  if (!PHONE_RE.test(normalized)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }
  if (`+86${normalized}` === auth.user?.phoneNumber) {
    uni.showToast({ title: '新手机号与当前一致', icon: 'none' })
    return
  }
  newPhone.value = normalized
  sendingOtp.value = true
  try {
    await sendChangePhoneOtp(`+86${normalized}`)
    uni.showToast({ title: '验证码已发送', icon: 'none' })
    startCountdown()
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    sendingOtp.value = false
  }
}

async function handleConfirmPhone() {
  if (submittingPhone.value)
    return
  const normalized = normalizePhone(newPhone.value)
  if (!PHONE_RE.test(normalized)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }
  if (!/^\d{4,6}$/.test(phoneCode.value.trim())) {
    uni.showToast({ title: '请输入验证码', icon: 'none' })
    return
  }
  submittingPhone.value = true
  try {
    await auth.changePhone(`+86${normalized}`, phoneCode.value.trim())
    uni.showToast({ title: '手机号已更新', icon: 'success' })
    phoneModalVisible.value = false
    editingPhone.value = false
    newPhone.value = ''
    phoneCode.value = ''
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    submittingPhone.value = false
  }
}
</script>

<template>
  <view class="min-h-screen bg-gray-50 px-3 pt-3">
    <block v-if="auth.user">
      <!-- 头像 -->
      <view
        class="flex items-center rounded-3 bg-white px-4 py-4 shadow-sm"
        hover-class="bg-gray-50"
        @click="chooseAvatar"
      >
        <text class="text-4 text-gray-800">头像</text>
        <image
          :src="avatarUrl"
          class="ml-auto h-14 w-14 rounded-full bg-gray-100"
        />
        <view class="i-carbon-chevron-right ml-2 text-4 text-gray-300" />
      </view>
      <!-- 通用媒体上传组件：裸模式，仅复用其选择/直传/登记能力 -->
      <media-uploader
        ref="avatarUploader"
        type="image"
        bare
        @change="onAvatarChange"
      />

      <!-- 基础资料 -->
      <view class="mt-3 overflow-hidden rounded-3 bg-white shadow-sm">
        <view
          class="flex items-center px-4 py-3.5"
          hover-class="bg-gray-50"
          @click="editName"
        >
          <text class="text-4 text-gray-800">昵称</text>
          <text class="ml-auto block max-w-55 truncate text-4 text-gray-400">
            {{ auth.user.name }}
          </text>
          <view class="i-carbon-chevron-right ml-2 text-4 text-gray-300" />
        </view>

        <view
          class="flex items-center border-t border-gray-100 px-4 py-3.5"
          hover-class="bg-gray-50"
          @click="openPhoneModal"
        >
          <text class="text-4 text-gray-800">手机号</text>
          <text class="ml-auto text-4 text-gray-400">
            {{ phoneText || '未绑定' }}
          </text>
          <view
            class="i-carbon-chevron-right ml-2 text-4 text-gray-300 transition-transform"
            :class="editingPhone ? 'rotate-90' : ''"
          />
        </view>

        <view class="flex items-center border-t border-gray-100 px-4 py-3.5">
          <text class="text-4 text-gray-800">邮箱</text>
          <text class="ml-auto block max-w-55 truncate text-4 text-gray-400">
            {{ auth.user.email || '—' }}
          </text>
        </view>
      </view>

      <!-- 换绑手机号弹窗 -->
      <view
        v-if="editingPhone"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8 transition-opacity duration-200"
        :class="phoneModalVisible ? 'opacity-100' : 'opacity-0'"
        @click="closePhoneModal"
        @touchmove.stop.prevent
      >
        <view
          class="w-full rounded-3 bg-white p-4 shadow-lg transition-all duration-200"
          :class="phoneModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'"
          @click.stop
        >
          <view class="mb-3 flex items-center">
            <text class="text-4 text-gray-900 font-medium">更换手机号</text>
            <view
              class="i-carbon-close ml-auto p-1 text-4 text-gray-400"
              @click="closePhoneModal"
            />
          </view>
          <view class="mb-3 h-11 flex items-center overflow-hidden border border-gray-400 rounded-2 border-solid bg-white">
            <view class="h-full flex items-center border-r border-gray-400 bg-gray-50 px-3 text-4 text-gray-700">
              +86
            </view>
            <input
              v-model="newPhone"
              type="number"
              :maxlength="11"
              placeholder="请输入新手机号"
              class="h-full flex-1 px-3 text-4"
            >
          </view>
          <view class="mb-4 flex items-center gap-3">
            <input
              v-model="phoneCode"
              type="number"
              :maxlength="6"
              placeholder="请输入验证码"
              class="h-11 flex-1 border border-gray-400 rounded-2 border-solid px-3 text-4"
            >
            <button
              :disabled="countdown > 0 || sendingOtp"
              class="h-11 shrink-0 rounded-2 px-3 text-4"
              :class="countdown > 0 || sendingOtp ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-700'"
              @click="handleSendOtp"
            >
              {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
            </button>
          </view>
          <button
            :loading="submittingPhone"
            class="h-11 w-full rounded-2 bg-green-600 text-4 text-white"
            @click="handleConfirmPhone"
          >
            确认绑定
          </button>
        </view>
      </view>
    </block>
  </view>
</template>
