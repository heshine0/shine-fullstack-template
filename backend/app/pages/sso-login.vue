<script setup lang="ts">
/**
 * 小程序 web-view 一次性票据免登录落地页（匿名可访问，见 auth.global.ts 白名单）。
 * URL 形如 /sso-login#ott=<token>&redirect=/dashboard（token 放 fragment，不进服务端日志），
 * 兼容 /sso-login?ott=<token> 查询参数兜底（手工测试）。
 */
definePageMeta({ layout: false })

const { fetchMe } = useAuth()
const toast = useToast()

const loading = ref(true)
const errorMessage = ref('')

/** 仅允许站内路径：以单个 '/' 开头，排除 '//' 协议相对 URL，防开放重定向。 */
function resolveSafeRedirect(raw: unknown): string {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/dashboard'
}

/** 从 hash 优先、query 兜底解析票据与跳转目标。 */
function readParams(): { token: string | null, redirect: string } {
  if (import.meta.client) {
    const hash = window.location.hash
    if (hash.length > 1) {
      const params = new URLSearchParams(hash.slice(1))
      const token = params.get('ott')
      if (token) return { token, redirect: resolveSafeRedirect(params.get('redirect')) }
    }
  }
  const route = useRoute()
  const queryToken = route.query.ott
  return {
    token: typeof queryToken === 'string' ? queryToken : null,
    redirect: resolveSafeRedirect(route.query.redirect)
  }
}

async function exchange() {
  const { token, redirect } = readParams()
  if (!token) {
    loading.value = false
    errorMessage.value = '登录链接缺少临时票据，请返回小程序重新进入'
    return
  }

  try {
    await $fetch('/api/auth/one-time-token/verify', {
      method: 'POST',
      credentials: 'include',
      body: { token }
    })
    // 兑换成功：立刻清除地址栏中的票据（hash/query），再刷新会话并跳转
    window.history.replaceState(null, '', window.location.pathname)
    await fetchMe(true)
    toast.add({ title: '登录成功', color: 'success' })
    await navigateTo(redirect, { replace: true })
  } catch (err) {
    // better-call 原生错误：400 { code:'BAD_REQUEST', message:'Invalid token' 等 }
    const e = err as { data?: { message?: string } }
    loading.value = false
    errorMessage.value = e?.data?.message
      ? `登录链接已失效（${e.data.message}），请返回小程序重新进入`
      : '登录失败，请返回小程序重新进入'
  }
}

// 兑换只在浏览器端进行（window/history 仅客户端可用）
onMounted(() => {
  void exchange()
})
</script>

<template>
  <UContainer class="min-h-screen flex items-center justify-center px-4">
    <UCard class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-2 mb-6">
        <UIcon
          name="i-lucide-feather"
          class="size-8 text-primary"
        />
        <h1 class="text-xl font-semibold">
          桐乡武协管理后台
        </h1>
        <p class="text-sm text-muted">
          正在通过小程序免登录进入…
        </p>
      </div>

      <div
        v-if="loading"
        class="flex flex-col items-center gap-3 py-4"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin text-primary"
        />
        <p class="text-sm text-muted">
          正在校验登录凭证
        </p>
      </div>

      <template v-else>
        <UAlert
          :title="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          class="mb-4"
        />
        <UButton
          label="前往账号登录"
          icon="i-lucide-log-in"
          class="w-full"
          :to="'/login'"
        />
      </template>
    </UCard>
  </UContainer>
</template>
