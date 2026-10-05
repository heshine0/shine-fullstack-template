<script setup lang="ts">
import type { Component } from 'vue'

const route = useRoute()
const { user, isAdmin, logout } = useAuth()
const toast = useToast()

interface NavItem {
  label: string
  to: string
  icon: Component
  adminOnly?: boolean
}

const navItems = computed<NavItem[]>(() => [
  { label: '仪表盘', to: '/dashboard', icon: 'i-lucide-layout-dashboard' as unknown as Component },
  { label: '用户管理', to: '/admin/users', icon: 'i-lucide-users' as unknown as Component, adminOnly: true },
  { label: '角色管理', to: '/admin/roles', icon: 'i-lucide-shield-check' as unknown as Component, adminOnly: true },
  { label: '媒体管理', to: '/admin/media', icon: 'i-lucide-images' as unknown as Component, adminOnly: true }
])

const visibleNav = computed(() => navItems.value.filter(i => !i.adminOnly || isAdmin.value))

function isActive(to: string) {
  if (to === '/dashboard') return route.path === '/dashboard' || route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

async function onLogout() {
  await logout()
  toast.add({ title: '已退出登录', color: 'success' })
}

const mobileOpen = ref(false)
</script>

<template>
  <div class="min-h-screen flex bg-elevated text-highlighted">
    <!-- 桌面侧边栏 -->
    <aside class="hidden md:flex w-60 shrink-0 flex-col border-b border-default bg-default">
      <div class="h-14 flex items-center gap-2 px-4 border-b border-default">
        <UIcon
          name="i-lucide-feather"
          class="size-5 text-primary"
        />
        <span class="font-semibold">桐乡武协后台</span>
      </div>
      <nav class="flex-1 p-2 space-y-1">
        <NuxtLink
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          :class="isActive(item.to)
            ? 'bg-primary text-white'
            : 'text-muted hover:bg-elevated hover:text-highlighted'"
        >
          <UIcon
            :name="item.icon"
            class="size-4"
          />
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <div class="flex-1 flex flex-col min-w-0">
      <!-- 顶栏 -->
      <header class="h-14 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-default bg-default">
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-menu"
            class="md:hidden"
            aria-label="菜单"
            @click="mobileOpen = true"
          />
          <span class="md:hidden font-semibold text-sm">桐乡武协后台</span>
        </div>

        <div class="flex items-center gap-2 min-w-0">
          <UBadge
            v-if="isAdmin"
            color="primary"
            variant="subtle"
            size="sm"
          >
            管理员
          </UBadge>
          <span class="text-sm text-muted truncate hidden sm:inline max-w-48">{{ user?.name || user?.email }}</span>
          <UAvatar
            :alt="user?.name ?? ''"
            :text="(user?.name || user?.email || '?').slice(0, 1).toUpperCase()"
            size="sm"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-log-out"
            label="退出"
            size="sm"
            @click="onLogout"
          />
        </div>
      </header>

      <main class="flex-1 p-4 sm:p-6 overflow-x-hidden">
        <slot />
      </main>
    </div>

    <!-- 移动端抽屉菜单 -->
    <USlideover
      v-model:open="mobileOpen"
      side="left"
      title="导航"
      class="md:hidden"
    >
      <nav class="p-2 space-y-1">
        <NuxtLink
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium"
          :class="isActive(item.to)
            ? 'bg-primary text-white'
            : 'text-muted hover:bg-elevated hover:text-highlighted'"
          @click="mobileOpen = false"
        >
          <UIcon
            :name="item.icon"
            class="size-4"
          />
          {{ item.label }}
        </NuxtLink>
      </nav>
    </USlideover>
  </div>
</template>
