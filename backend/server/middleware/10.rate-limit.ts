/**
 * 进程内固定窗口限流（按 IP key，窗口 60s）。
 * - 全局 /api/**：RATE_LIMIT_GLOBAL_MAX（默认 300）
 * - 敏感端点（登录/注册/发 OTP/管理员创建用户）：RATE_LIMIT_SENSITIVE_MAX（默认 10）
 * 后续如需分布式限流，可替换为 Redis 实现而不改调用方。
 */
const WINDOW_MS = 60_000

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// 周期性清理过期桶（unref 避免阻止进程退出）
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, WINDOW_MS)
cleanupTimer.unref?.()

function isSensitiveEndpoint(pathname: string, method: string): boolean {
  return (
    /^\/api\/auth\/sign-in(\/|$)/.test(pathname)
    || /^\/api\/auth\/sign-up(\/|$)/.test(pathname)
    || pathname === '/api/auth/phone-number/send-otp'
    || (pathname === '/api/admin/users' && method === 'POST')
  )
}

function getClientIp(event: Parameters<typeof getRequestHeader>[0]): string {
  const xff = getRequestHeader(event, 'x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? 'unknown'
  return (
    getRequestHeader(event, 'x-real-ip')
    || event.node.req.socket?.remoteAddress
    || 'unknown'
  )
}

export default defineEventHandler((event) => {
  const pathname = (event.path ?? '').split('?')[0] ?? ''
  if (!pathname.startsWith('/api/') || event.method === 'OPTIONS') return

  const env = getEnv()
  const sensitive = isSensitiveEndpoint(pathname, event.method)
  const max = sensitive ? env.RATE_LIMIT_SENSITIVE_MAX : env.RATE_LIMIT_GLOBAL_MAX
  const ip = getClientIp(event)
  const key = `${sensitive ? 'sensitive' : 'global'}:${ip}`

  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(key, bucket)
  }
  bucket.count += 1

  setResponseHeaders(event, {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(Math.max(0, max - bucket.count))
  })

  if (bucket.count > max) {
    setResponseHeader(event, 'Retry-After', Math.ceil((bucket.resetAt - now) / 1000))
    logWarn(event, '触发速率限制', { path: pathname, ip, sensitive })
    throw createApiError('RATE_LIMITED')
  }
})
