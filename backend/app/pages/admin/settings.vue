<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

interface SettingRow {
  key: string
  value: unknown
}

const toast = useToast()
const rows = ref<SettingRow[]>([])
const loading = ref(false)
const columns = [
  { accessorKey: 'key', header: '键（key）' },
  { accessorKey: 'value', header: '值（JSON）' },
  { id: 'actions', header: '操作' }
]

function previewValue(value: unknown): string {
  const text = JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ code: 'OK', data: SettingRow[] }>('/api/admin/settings', { credentials: 'include' })
    rows.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载设置列表失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

// 新建 / 编辑共用；formState.value 为 JSON 原文
const formOpen = ref(false)
const formSubmitting = ref(false)
const editingKey = ref<string | null>(null)
const formState = reactive({ key: '', value: '{}' })

function openCreate() {
  editingKey.value = null
  formState.key = ''
  formState.value = '{}'
  formOpen.value = true
}

function openEdit(row: SettingRow) {
  editingKey.value = row.key
  formState.key = row.key
  formState.value = JSON.stringify(row.value, null, 2)
  formOpen.value = true
}

function validateForm(s: typeof formState): FormError[] {
  const errors: FormError[] = []
  if (!editingKey.value && !/^[a-z][a-z0-9_.-]{0,63}$/i.test(s.key.trim())) {
    errors.push({ name: 'key', message: '字母开头，仅含字母、数字、下划线、连字符、点（≤64）' })
  }
  try {
    JSON.parse(s.value)
  } catch (err) {
    errors.push({ name: 'value', message: `不是合法 JSON：${(err as Error).message}` })
  }
  return errors
}

async function onSubmit(_e: FormSubmitEvent<typeof formState>) {
  formSubmitting.value = true
  try {
    const parsed = JSON.parse(formState.value)
    if (editingKey.value) {
      await $fetch(`/api/admin/settings/${encodeURIComponent(editingKey.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        body: { value: parsed }
      })
      toast.add({ title: '设置已更新', color: 'success' })
    } else {
      await $fetch('/api/admin/settings', {
        method: 'POST',
        credentials: 'include',
        body: { key: formState.key.trim(), value: parsed }
      })
      toast.add({ title: '设置创建成功', color: 'success' })
    }
    formOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    formSubmitting.value = false
  }
}

// 删除
const deleteOpen = ref(false)
const deleteTarget = ref<SettingRow | null>(null)
const deleteSubmitting = ref(false)

function askDelete(row: SettingRow) {
  deleteTarget.value = row
  deleteOpen.value = true
}

async function onDelete() {
  if (!deleteTarget.value) return
  deleteSubmitting.value = true
  try {
    await $fetch(`/api/admin/settings/${encodeURIComponent(deleteTarget.value.key)}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    toast.add({ title: '设置已删除', color: 'success' })
    deleteOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          设置管理
        </h1>
        <p class="text-sm text-muted mt-1">
          键值对形式的全局配置，值为任意 JSON；设置对所有访客可见（GET /api/settings），请勿存放密钥
        </p>
      </div>
      <UButton
        label="新建设置"
        icon="i-lucide-settings-2"
        @click="openCreate"
      />
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #key-cell="{ row }">
          <span class="font-mono text-sm font-medium">{{ row.original.key }}</span>
        </template>

        <template #value-cell="{ row }">
          <span
            class="font-mono text-xs text-muted break-all"
            :title="JSON.stringify(row.original.value)"
          >
            {{ previewValue(row.original.value) }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-pencil"
              label="编辑"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              label="删除"
              @click="askDelete(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无设置数据
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- 新建 / 编辑设置 -->
    <UModal
      v-model:open="formOpen"
      :title="editingKey ? '编辑设置' : '新建设置'"
    >
      <template #body>
        <UForm
          :state="formState"
          :validate="validateForm"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="键（key）"
            name="key"
            required
            hint="字母开头，仅含字母、数字、下划线、连字符、点；用于程序读取，建议英文"
          >
            <UInput
              v-model="formState.key"
              class="w-full font-mono"
              placeholder="例如：site.title"
              :disabled="!!editingKey"
            />
          </UFormField>
          <UFormField
            label="值（JSON）"
            name="value"
            required
            hint="合法 JSON：对象、数组、字符串、数字、布尔或 null"
          >
            <UTextarea
              v-model="formState.value"
              class="w-full font-mono text-xs"
              :rows="10"
              placeholder="例如：&quot;桐乡武协&quot;"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="formOpen = false"
            />
            <UButton
              type="submit"
              :label="editingKey ? '保存' : '创建'"
              :loading="formSubmitting"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- 删除确认 -->
    <UModal
      v-model:open="deleteOpen"
      title="删除设置"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定要删除设置
            <span class="font-mono font-medium">{{ deleteTarget?.key }}</span>
            吗？此操作不可撤销。
          </p>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="deleteOpen = false"
            />
            <UButton
              color="error"
              label="确认删除"
              :loading="deleteSubmitting"
              @click="onDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
