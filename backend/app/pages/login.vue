<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: false })

const { fetchMe } = useAuth()
const toast = useToast()

const state = reactive({
  email: 'admin@tongxiangwuxie.local',
  password: ''
})

const loading = ref(false)
const errorMessage = ref('')

function validate(stateArg: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!stateArg.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stateArg.email)) {
    errors.push({ name: 'email', message: '请输入有效的邮箱地址' })
  }
  if (!stateArg.password || stateArg.password.length < 8) {
    errors.push({ name: 'password', message: '密码至少 8 位' })
  }
  return errors
}

async function onSubmit(_event: FormSubmitEvent<typeof state>) {
  loading.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/sign-in/email', {
      method: 'POST',
      credentials: 'include',
      body: { email: state.email.trim(), password: state.password }
    })
    await fetchMe(true)
    toast.add({ title: '登录成功', color: 'success' })
    await navigateTo('/dashboard', { replace: true })
  } catch (err) {
    const e = err as { data?: { message?: string }, statusMessage?: string }
    errorMessage.value = e?.data?.message || e?.statusMessage || '登录失败，请检查邮箱和密码'
  } finally {
    loading.value = false
  }
}
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
          桐乡吾协管理后台
        </h1>
        <p class="text-sm text-muted">
          请使用管理员账号登录
        </p>
      </div>

      <UAlert
        v-if="errorMessage"
        :title="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        class="mb-4"
      />

      <UForm
        :state="state"
        :validate="validate"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="邮箱"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="username"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="密码"
          name="password"
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="登录"
          :loading="loading"
          class="w-full"
          icon="i-lucide-log-in"
        />
      </UForm>
    </UCard>
  </UContainer>
</template>
