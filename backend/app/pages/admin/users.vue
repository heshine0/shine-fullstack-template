<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

interface RoleOption { label: string, value: string }
interface UserRow {
  id: string
  name: string
  email: string
  phoneNumber: string | null
  banned: boolean
  createdAt: string
  roles: string[]
}
interface ListResponse {
  code: 'OK'
  data: UserRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}
interface RoleRow { id: string, name: string, description: string }

const toast = useToast()
const { user: currentUser } = useAuth()

// 列表状态
const rows = ref<UserRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const searchInput = ref('')
const keyword = ref('')

// 角色可选项
const roleOptions = ref<RoleOption[]>([])

async function loadRoles() {
  try {
    const res = await $fetch<{ code: 'OK', data: RoleRow[] }>('/api/admin/roles', { credentials: 'include' })
    roleOptions.value = res.data.map(r => ({ label: r.description ? `${r.description}（${r.name}）` : r.name, value: r.name }))
  } catch { /* 忽略，表单角色为空 */ }
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>('/api/admin/users', {
      credentials: 'include',
      query: { page: page.value, pageSize, ...(keyword.value ? { keyword: keyword.value } : {}) }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载用户列表失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    keyword.value = val.trim()
    page.value = 1
    load()
  }, 300)
})
watch(page, () => load())

const columns = [
  { accessorKey: 'name', header: '姓名' },
  { accessorKey: 'email', header: '邮箱' },
  { accessorKey: 'phoneNumber', header: '手机号' },
  { accessorKey: 'roles', header: '角色' },
  { accessorKey: 'banned', header: '状态' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' }
]

// 新建用户
const createOpen = ref(false)
const createSubmitting = ref(false)
const createState = reactive({ name: '', email: '', password: '', phoneNumber: '', roles: ['user'] })

function resetCreateForm() {
  createState.name = ''
  createState.email = ''
  createState.password = ''
  createState.phoneNumber = ''
  createState.roles = ['user']
}

function validateCreate(s: typeof createState): FormError[] {
  const errors: FormError[] = []
  if (!s.name.trim()) errors.push({ name: 'name', message: '请输入姓名' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) errors.push({ name: 'email', message: '邮箱格式不正确' })
  if (s.password.length < 8) errors.push({ name: 'password', message: '密码至少 8 位' })
  if (s.phoneNumber && s.phoneNumber.trim().length < 5) errors.push({ name: 'phoneNumber', message: '手机号格式不正确' })
  return errors
}

async function onCreate(_e: FormSubmitEvent<typeof createState>) {
  createSubmitting.value = true
  try {
    await $fetch('/api/admin/users', {
      method: 'POST',
      credentials: 'include',
      body: {
        name: createState.name.trim(),
        email: createState.email.trim(),
        password: createState.password,
        roles: createState.roles,
        ...(createState.phoneNumber.trim() ? { phoneNumber: createState.phoneNumber.trim() } : {})
      }
    })
    toast.add({ title: '用户创建成功', color: 'success' })
    createOpen.value = false
    resetCreateForm()
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    createSubmitting.value = false
  }
}

// 分配角色
const assignOpen = ref(false)
const assignSubmitting = ref(false)
const assignTarget = ref<UserRow | null>(null)
const assignRoles = ref<string[]>([])

function openAssign(row: UserRow) {
  assignTarget.value = row
  assignRoles.value = [...row.roles]
  assignOpen.value = true
}

async function onAssign() {
  if (!assignTarget.value) return
  assignSubmitting.value = true
  try {
    await $fetch(`/api/admin/users/${assignTarget.value.id}/roles`, {
      method: 'PUT',
      credentials: 'include',
      body: { roles: assignRoles.value }
    })
    toast.add({ title: '角色已更新', color: 'success' })
    assignOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    assignSubmitting.value = false
  }
}

// 启用/停用
async function toggleBan(row: UserRow) {
  const next = !row.banned
  try {
    await $fetch(`/api/admin/users/${row.id}`, {
      method: 'PATCH',
      credentials: 'include',
      body: { banned: next }
    })
    toast.add({ title: next ? '已停用该用户' : '已启用该用户', color: 'success' })
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  }
}

// 删除确认
const deleteOpen = ref(false)
const deleteTarget = ref<UserRow | null>(null)
const deleteSubmitting = ref(false)

function askDelete(row: UserRow) {
  deleteTarget.value = row
  deleteOpen.value = true
}

async function onDelete() {
  if (!deleteTarget.value) return
  deleteSubmitting.value = true
  try {
    await $fetch(`/api/admin/users/${deleteTarget.value.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    toast.add({ title: '用户已删除', color: 'success' })
    deleteOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

function roleVariant(name: string): string {
  return name === 'admin' ? 'solid' : 'subtle'
}

onMounted(async () => {
  await loadRoles()
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          用户管理
        </h1>
        <p class="text-sm text-muted mt-1">
          共 {{ total }} 名用户
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UInput
          v-model="searchInput"
          placeholder="搜索姓名 / 邮箱 / 手机号"
          icon="i-lucide-search"
          class="w-56 sm:w-64"
          clearable
        />
        <UButton
          label="新建用户"
          icon="i-lucide-user-plus"
          @click="createOpen = true"
        />
      </div>
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #phoneNumber-cell="{ row }">
          {{ row.original.phoneNumber || '—' }}
        </template>

        <template #roles-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="name in row.original.roles"
              :key="name"
              :color="name === 'admin' ? 'primary' : 'neutral'"
              :variant="(roleVariant(name) as 'solid' | 'subtle')"
              size="sm"
            >
              {{ name }}
            </UBadge>
            <span
              v-if="!row.original.roles.length"
              class="text-muted text-sm"
            >—</span>
          </div>
        </template>

        <template #banned-cell="{ row }">
          <UBadge
            :color="row.original.banned ? 'error' : 'success'"
            variant="subtle"
            size="sm"
          >
            {{ row.original.banned ? '已停用' : '正常' }}
          </UBadge>
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
              icon="i-lucide-user-cog"
              label="角色"
              @click="openAssign(row.original)"
            />
            <UButton
              :color="row.original.banned ? 'success' : 'neutral'"
              variant="ghost"
              size="xs"
              :icon="row.original.banned ? 'i-lucide-play' : 'i-lucide-ban'"
              :label="row.original.banned ? '启用' : '停用'"
              :disabled="row.original.id === currentUser?.id"
              @click="toggleBan(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              label="删除"
              :disabled="row.original.id === currentUser?.id"
              @click="askDelete(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无用户数据
          </div>
        </template>
      </UTable>

      <div
        v-if="total > pageSize"
        class="flex justify-center mt-4"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
        />
      </div>
    </UCard>

    <!-- 新建用户 -->
    <UModal
      v-model:open="createOpen"
      title="新建用户"
    >
      <template #body>
        <UForm
          :state="createState"
          :validate="validateCreate"
          class="space-y-4"
          @submit="onCreate"
        >
          <UFormField
            label="姓名"
            name="name"
            required
          >
            <UInput
              v-model="createState.name"
              class="w-full"
              placeholder="请输入姓名"
            />
          </UFormField>
          <UFormField
            label="邮箱"
            name="email"
            required
          >
            <UInput
              v-model="createState.email"
              type="email"
              class="w-full"
              placeholder="you@example.com"
            />
          </UFormField>
          <UFormField
            label="初始密码"
            name="password"
            required
            hint="至少 8 位"
          >
            <UInput
              v-model="createState.password"
              type="password"
              class="w-full"
              placeholder="至少 8 位"
            />
          </UFormField>
          <UFormField
            label="手机号（可选）"
            name="phoneNumber"
          >
            <UInput
              v-model="createState.phoneNumber"
              class="w-full"
              placeholder="可选"
            />
          </UFormField>
          <UFormField
            label="角色"
            name="roles"
          >
            <UCheckboxGroup
              v-model="createState.roles"
              :items="roleOptions"
              class="gap-2"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="createOpen = false"
            />
            <UButton
              type="submit"
              label="创建"
              :loading="createSubmitting"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- 分配角色 -->
    <UModal
      v-model:open="assignOpen"
      :title="`分配角色 · ${assignTarget?.name ?? ''}`"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            为该用户勾选一个或多个角色：
          </p>
          <UCheckboxGroup
            v-model="assignRoles"
            :items="roleOptions"
            class="gap-2"
          />
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="assignOpen = false"
            />
            <UButton
              label="保存"
              :loading="assignSubmitting"
              @click="onAssign"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 删除确认 -->
    <UModal
      v-model:open="deleteOpen"
      title="删除用户"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定要删除用户
            <span class="font-medium">{{ deleteTarget?.name }}（{{ deleteTarget?.email }}）</span>
            吗？此操作不可恢复，其会话与账号将一并清除。
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
