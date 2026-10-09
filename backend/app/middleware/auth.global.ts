/** 全局路由守卫：无会话跳登录；非 admin 不得进入 /admin；已登录访问 /login 跳 dashboard。 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isAdmin, fetchMe } = useAuth()
  await fetchMe()

  // 小程序 web-view 一次性票据免登录落地页：匿名可访问，兑换结果由页面自行处理
  if (to.path === '/sso-login') return

  if (to.path === '/login') {
    if (user.value) return navigateTo('/dashboard', { replace: true })
    return
  }

  if (!user.value) {
    return navigateTo('/login', { replace: true })
  }

  if (to.path.startsWith('/admin') && !isAdmin.value) {
    return navigateTo('/dashboard', { replace: true })
  }
})
