<script setup lang="ts">
const { user, isAdmin } = useAuth()

interface Stat {
  label: string
  value: number | string
  icon: string
}

const stats = ref<Stat[]>([])
const loading = ref(false)

async function loadStats() {
  if (!isAdmin.value) return
  loading.value = true
  try {
    const [usersRes, rolesRes] = await Promise.all([
      $fetch<{ code: 'OK', pagination: { total: number } }>('/api/admin/users', {
        credentials: 'include',
        query: { page: 1, pageSize: 1 }
      }),
      $fetch<{ code: 'OK', data: Array<{ id: string }> }>('/api/admin/roles', { credentials: 'include' })
    ])
    stats.value = [
      { label: '用户总数', value: usersRes.pagination.total, icon: 'i-lucide-users' },
      { label: '角色总数', value: rolesRes.data.length, icon: 'i-lucide-shield-check' }
    ]
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        你好，{{ user?.name || user?.email }}
      </h1>
      <p class="text-sm text-muted mt-1">
        欢迎使用桐乡武协管理后台。
      </p>
    </div>

    <div
      v-if="isAdmin"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <UCard
        v-for="stat in stats"
        :key="stat.label"
        class="flex-row items-center gap-4"
      >
        <div class="flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary shrink-0">
          <UIcon
            :name="stat.icon"
            class="size-6"
          />
        </div>
        <div>
          <div class="text-2xl font-semibold leading-none">
            {{ loading ? '…' : stat.value }}
          </div>
          <div class="text-sm text-muted mt-1">
            {{ stat.label }}
          </div>
        </div>
      </UCard>
    </div>

    <UCard v-else>
      <p class="text-sm text-muted">
        你的账号没有管理权限。如需访问用户与角色管理，请联系管理员分配角色。
      </p>
    </UCard>
  </div>
</template>
