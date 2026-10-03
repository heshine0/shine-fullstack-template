<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

interface RoleRow {
  id: string
  name: string
  description: string
  createdAt: string
}

const BUILTIN = new Set(['admin', 'user'])

const toast = useToast()
const rows = ref<RoleRow[]>([])
const loading = ref(false)
const columns = [
  { accessorKey: 'name', header: '角色标识' },
  { accessorKey: 'description', header: '描述' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' }
]

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ code: 'OK', data: RoleRow[] }>('/api/admin/roles', { credentials: 'include' })
    rows.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载角色列表失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

// 新建 / 编辑共用
const formOpen = ref(false)
const formSubmitting = ref(false)
const editingId = ref<string | null>(null)
const formState = reactive({ name: '', description: '' })

const isBuiltin = computed(() => (editingId.value ? BUILTIN.has(roleNameById(editingId.value)) : false))
function roleNameById(id: string | null): string {
  return rows.value.find(r => r.id === id)?.name ?? ''
}

function openCreate() {
  editingId.value = null
  formState.name = ''
  formState.description = ''
  formOpen.value = true
}

function openEdit(row: RoleRow) {
  editingId.value = row.id
  formState.name = row.name
  formState.description = row.description
  formOpen.value = true
}

function validateForm(s: typeof formState): FormError[] {
  const errors: FormError[] = []
  if (!/^[a-z][a-z0-9_-]{0,49}$/i.test(s.name.trim())) {
    errors.push({ name: 'name', message: '字母开头，仅含字母、数字、下划线、连字符（≤50）' })
  }
  if (s.description.trim().length > 100) errors.push({ name: 'description', message: '描述不超过 100 字' })
  return errors
}

async function onSubmit(_e: FormSubmitEvent<typeof formState>) {
  formSubmitting.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/admin/roles/${editingId.value}`, {
        method: 'PATCH',
        credentials: 'include',
        // 内置角色不提交 name，避免触发 409
        body: {
          ...(isBuiltin.value ? {} : { name: formState.name.trim() }),
          description: formState.description.trim()
        }
      })
      toast.add({ title: '角色已更新', color: 'success' })
    } else {
      await $fetch('/api/admin/roles', {
        method: 'POST',
        credentials: 'include',
        body: { name: formState.name.trim(), description: formState.description.trim() }
      })
      toast.add({ title: '角色创建成功', color: 'success' })
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
const deleteTarget = ref<RoleRow | null>(null)
const deleteSubmitting = ref(false)

function askDelete(row: RoleRow) {
  if (BUILTIN.has(row.name)) return
  deleteTarget.value = row
  deleteOpen.value = true
}

async function onDelete() {
  if (!deleteTarget.value) return
  deleteSubmitting.value = true
  try {
    await $fetch(`/api/admin/roles/${deleteTarget.value.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    toast.add({ title: '角色已删除', color: 'success' })
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
          角色管理
        </h1>
        <p class="text-sm text-muted mt-1">
          内置角色 admin / user 不可删除，授权判据为角色标识
        </p>
      </div>
      <UButton
        label="新建角色"
        icon="i-lucide-shield-plus"
        @click="openCreate"
      />
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-shield"
              class="size-4 text-muted"
            />
            <span class="font-medium">{{ row.original.name }}</span>
            <UBadge
              v-if="BUILTIN.has(row.original.name)"
              color="primary"
              variant="subtle"
              size="xs"
            >
              内置
            </UBadge>
          </div>
        </template>

        <template #description-cell="{ row }">
          {{ row.original.description || '—' }}
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.createdAt) }}</span>
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
              :disabled="BUILTIN.has(row.original.name)"
              @click="askDelete(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无角色数据
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- 新建 / 编辑角色 -->
    <UModal
      v-model:open="formOpen"
      :title="editingId ? '编辑角色' : '新建角色'"
    >
      <template #body>
        <UForm
          :state="formState"
          :validate="validateForm"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="角色标识"
            name="name"
            required
            hint="字母开头，仅含字母、数字、下划线、连字符；用于程序判权，建议保持英文"
          >
            <UInput
              v-model="formState.name"
              class="w-full font-mono"
              placeholder="例如：editor"
              :disabled="isBuiltin"
            />
          </UFormField>
          <UFormField
            label="描述"
            name="description"
          >
            <UInput
              v-model="formState.description"
              class="w-full"
              placeholder="角色用途说明（可选）"
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
              :label="editingId ? '保存' : '创建'"
              :loading="formSubmitting"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- 删除确认 -->
    <UModal
      v-model:open="deleteOpen"
      title="删除角色"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定要删除角色
            <span class="font-medium">{{ deleteTarget?.name }}</span>
            吗？该角色与用户的关联将被移除，用户本身不受影响。
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
