<script setup lang="ts">
// 入口由全局守卫决定去向：已登录→/dashboard，未登录→/login
definePageMeta({ layout: false })
await navigateTo('/dashboard', { replace: true })
</script>

<template>
  <div />
</template>
