<script lang="ts" setup>
import { sendPhoneOtp } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { ensureDecodeURIComponent, HOME_PAGE } from '@/utils'

definePage({
  layout: 'blank',
  style: {
    navigationBarTitleText: '登录',
  },
})

const auth = useAuthStore()

// 登录成功后的回跳地址，由登录入口通过 ?redirect= 携带；缺省回兜底首页
const redirectUrl = ref('')

onLoad((options) => {
  const raw = options?.redirect
  if (typeof raw !== 'string' || !raw)
    return
  // 部分平台 onLoad 参数已解码，仅在仍为编码形态时解码，避免双重解码
  const decoded = raw.startsWith('%') ? ensureDecodeURIComponent(raw) : raw
  // 仅允许应用内绝对路径，拒绝 http(s)://、// 等外链
  if (decoded.startsWith('/') && !decoded.startsWith('//'))
    redirectUrl.value = decoded
})

/** 登录成功后优先回跳来源页，reLaunch 同时兼容 tabbar 页与普通页 */
function navigateAfterLogin() {
  uni.reLaunch({ url: redirectUrl.value || HOME_PAGE })
}

type LoginTab = 'email' | 'phone'
const tab = ref<LoginTab>('email')

// 邮箱密码
// 本地联调预填初始管理员账号（生产请勿预填）
const email = ref('admin@tongxiangwuxie.local')
const password = ref('Admin12345')
const submitting = ref(false)

// 手机号验证码
const phone = ref('')
const code = ref('')
const sendingOtp = ref(false)
const otpSubmitting = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

// 国家/地区区号（后端当前仅支持中国大陆 +86，结构预留扩展）
const COUNTRY_CODES = [
  { label: '中国大陆 +86', value: '+86' },
] as const
const countryCode = ref<string>('+86')

function pickCountryCode() {
  uni.showActionSheet({
    itemList: COUNTRY_CODES.map(item => item.label),
    success: (res) => {
      const picked = COUNTRY_CODES[res.tapIndex]
      if (picked)
        countryCode.value = picked.value
    },
  })
}

/** 拼接带国家号的完整手机号（如 '+8613800138000'），供后端使用。 */
function fullPhoneNumber(): string {
  const normalized = normalizePhone(phone.value)
  return normalized ? `${countryCode.value}${normalized}` : ''
}

// 微信一键登录（仅 mp-weixin 展示）
const wechatLoading = ref(false)
// development 环境为 true，用普通按钮 + 手输手机号走后端 mock
const wechatMock = import.meta.env.VITE_WECHAT_MOCK === 'true'

const useOtherLogin = ref(false)
// #ifdef H5
useOtherLogin.value = true
// #endif

const PHONE_RE = /^1[3-9]\d{9}$/

function normalizePhone(input: string): string {
  return input.replaceAll(/[\s()-]/g, '').replace(/^\+?86/, '')
}

// 隐私协议同意状态：邮箱、手机验证码、微信三种登录方式均需先勾选
const agreed = ref(false)

const AGREEMENTS = {
  terms: {
    title: '用户协议',
    content: '欢迎使用桐乡武协服务平台。登录即表示您同意使用手机号或邮箱注册账号，并妥善保管账号信息、不得转借他人，您需对账号下的全部行为负责。',
  },
  privacy: {
    title: '隐私政策',
    content: '我们将收集您的手机号（或邮箱）用于创建和登录账号，并通过安全的 HttpOnly Cookie 维持登录会话；除法律法规要求外，不会向第三方共享您的个人信息。',
  },
} as const

/** 登录前统一校验是否已勾选协议，未勾选则弹出提示并阻止后续流程 */
function ensureAgreed(): boolean {
  if (agreed.value)
    return true
  uni.showToast({ title: '请先阅读并勾选用户协议和隐私政策', icon: 'none' })
  return false
}

/** 弹窗查看协议全文（协议正文后续可替换为独立页面） */
function showAgreement(key: keyof typeof AGREEMENTS) {
  const item = AGREEMENTS[key]
  uni.showModal({
    title: item.title,
    content: item.content,
    showCancel: false,
    confirmText: '我知道了',
  })
}

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

// 已登录用户进入登录页时直接跳到来源页（无 redirect 时回首页）
onShow(() => {
  if (auth.isLoggedIn) {
    navigateAfterLogin()
  }
})

async function handleEmailLogin() {
  if (submitting.value)
    return
  if (!ensureAgreed())
    return
  if (!email.value || !password.value) {
    uni.showToast({ title: '请输入邮箱和密码', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    await auth.login({ email: email.value.trim(), password: password.value })
    uni.showToast({ title: '登录成功', icon: 'success' })
    navigateAfterLogin()
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    submitting.value = false
  }
}

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

async function handleSendOtp() {
  if (sendingOtp.value || countdown.value > 0)
    return
  if (!ensureAgreed())
    return
  const normalized = normalizePhone(phone.value)
  if (!PHONE_RE.test(normalized)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }
  phone.value = normalized
  sendingOtp.value = true
  try {
    await sendPhoneOtp(fullPhoneNumber())
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

async function handlePhoneLogin() {
  if (otpSubmitting.value)
    return
  if (!ensureAgreed())
    return
  const normalized = normalizePhone(phone.value)
  if (!PHONE_RE.test(normalized)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }
  if (!/^\d{4,6}$/.test(code.value.trim())) {
    uni.showToast({ title: '请输入验证码', icon: 'none' })
    return
  }
  otpSubmitting.value = true
  try {
    await auth.loginByPhoneOtp(fullPhoneNumber(), code.value.trim())
    uni.showToast({ title: '登录成功', icon: 'success' })
    navigateAfterLogin()
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    otpSubmitting.value = false
  }
}

async function loginByWechatCode(phoneCode: string) {
  if (wechatLoading.value)
    return
  // mock 手输与真机授权两条微信链路最终都汇聚到这里，统一拦截协议勾选
  if (!ensureAgreed())
    return
  wechatLoading.value = true
  try {
    await auth.loginByWechat(phoneCode)
    uni.showToast({ title: '登录成功', icon: 'success' })
    navigateAfterLogin()
  }
  catch {
    // 错误提示已由响应拦截器统一弹出
  }
  finally {
    wechatLoading.value = false
  }
}

// 真机：getPhoneNumber 按钮回调，e.detail.code 交后端换手机号
function onGetPhoneNumber(e: { detail: { code?: string, errMsg?: string } }) {
  const { code: phoneCode, errMsg = '' } = e.detail
  if (!phoneCode || errMsg.includes('deny') || errMsg.includes('fail')) {
    uni.showToast({ title: '已取消微信授权', icon: 'none' })
    return
  }
  void loginByWechatCode(phoneCode)
}

// 开发 mock：弹窗输入 11 位手机号，拼成 'mock:<手机号>' 走同一后端链路
// （后端会按 '+86<手机号>' 规范化存储，与真机微信返回国家号的行为一致）
function onMockWechatLogin() {
  uni.showModal({
    title: '微信登录（联调 Mock）',
    editable: true,
    placeholderText: '请输入 11 位手机号',
    success: (res) => {
      if (!res.confirm)
        return
      const normalized = normalizePhone(res.content ?? '')
      if (!PHONE_RE.test(normalized)) {
        uni.showToast({ title: '手机号格式不正确', icon: 'none' })
        return
      }
      void loginByWechatCode(`mock:${normalized}`)
    },
  })
}
function goBack() {
  uni.navigateBack({ delta: 1 })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-gray-50 px-8 pt-safe">
    <view class="h-50px flex items-center justify-between px-3">
      <view class="h-8 w-8 center rounded-full bg-gray-50 text-gray-600" @click="goBack">
        <view class="i-carbon-arrow-left text-4" />
      </view>
    </view>
    <view class="mb-8 text-center">
      <!-- logo -->
      <image
        src="/static/logo.svg"
        mode="aspectFit"
        class="mx-auto mb-4 h-40 w-40"
      />
      <view class="text-6 text-gray-900 font-bold">
        桐乡武协
      </view>
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <view class="my-8">
      <!-- 联调 mock：普通按钮弹窗输入手机号 -->
      <button
        v-if="wechatMock"
        :loading="wechatLoading"
        class="h-11 rounded-2 bg-green-600 text-4 text-white"
        @click="onMockWechatLogin"
      >
        手机号快捷登录（Mock）
      </button>
      <!-- 真机：open-type=getPhoneNumber 拉起微信授权 -->
      <button
        v-else
        open-type="getPhoneNumber"
        :loading="wechatLoading"
        class="h-11 rounded-2 bg-green-600 text-4 text-white"
        @getphonenumber="onGetPhoneNumber"
      >
        手机号快捷登录
      </button>

      <view v-if="!useOtherLogin" class="m-6 text-center">
        <text class="cursor-pointer underline underline-offset-2" @click="useOtherLogin = true">使用其他登录方式</text>
      </view>
    </view>
    <!-- #endif -->

    <!-- 登录方式切换 -->
    <view v-if="useOtherLogin" class="mb-8 rounded-4 bg-white shadow-sm">
      <view class="flex p-4">
        <view
          class="h-9 flex flex-1 items-center justify-center rounded-1.5 text-4"
          :class="tab === 'email' ? 'bg-green-600 text-white' : 'text-gray-500'"
          @click="tab = 'email'"
        >
          邮箱密码
        </view>
        <view
          class="h-9 flex flex-1 items-center justify-center rounded-1.5 text-4"
          :class="tab === 'phone' ? 'bg-green-600 text-white' : 'text-gray-500'"
          @click="tab = 'phone'"
        >
          手机验证码
        </view>
      </view>

      <view class="p-4">
        <!-- 邮箱密码 -->
        <view v-if="tab === 'email'">
          <view class="mb-4">
            <view class="mb-2 text-3.5 text-gray-600">
              邮箱
            </view>
            <input
              v-model="email"
              type="text"
              placeholder="请输入邮箱"
              class="h-11 border-gray-400 rounded-2 border-solid px-3 text-4"
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
              class="h-11 border-gray-400 rounded-2 border-solid px-3 text-4"
            >
          </view>

          <button
            :loading="submitting"
            class="h-11 rounded-2 bg-green-600 text-4 text-white"
            @click="handleEmailLogin"
          >
            登录
          </button>
        </view>

        <!-- 手机号验证码 -->
        <view v-else>
          <view class="mb-4">
            <view class="mb-2 text-3.5 text-gray-600">
              手机号
            </view>
            <view class="h-11 flex overflow-hidden border-gray-400 rounded-2 border-solid bg-white">
              <view
                class="h-full flex items-center gap-1 border-r border-gray-400 bg-gray-50 px-3 text-4 text-gray-700"
                @click="pickCountryCode"
              >
                {{ countryCode }}
                <text class="text-3 text-gray-400">▾</text>
              </view>
              <input
                v-model="phone"
                type="number"
                :maxlength="11"
                placeholder="请输入手机号"
                class="h-full flex-1 px-3 text-4"
              >
            </view>
          </view>

          <view class="mb-6">
            <view class="mb-2 text-3.5 text-gray-600">
              验证码
            </view>
            <view class="flex items-center gap-3">
              <input
                v-model="code"
                type="number"
                :maxlength="6"
                placeholder="请输入验证码"
                class="h-11 flex-1 border-gray-400 rounded-2 border-solid px-3 text-4"
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
          </view>

          <button
            :loading="otpSubmitting"
            class="h-11 rounded-2 bg-green-600 text-4 text-white"
            @click="handlePhoneLogin"
          >
            登录
          </button>
        </view>
      </view>
    </view>

    <!-- 隐私协议勾选：未勾选时禁止任何登录方式 -->
    <view class="mb-8 flex items-center justify-center gap-2 px-4">
      <view
        class="h-4 w-4 center shrink-0 rounded-0.5 border-solid"
        :class="agreed ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400 bg-white text-transparent'"
        @click="agreed = !agreed"
      >
        <text class="text-3 leading-none">✓</text>
      </view>
      <text class="text-3 text-gray-500">
        我已阅读并同意
        <text class="text-green-700" @click="showAgreement('terms')">《用户协议》</text>
        与
        <text class="text-green-700" @click="showAgreement('privacy')">《隐私政策》</text>
      </text>
    </view>
  </view>
</template>
