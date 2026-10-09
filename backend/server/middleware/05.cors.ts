/**
 * 凭证感知的 CORS（dev proxy 的兜底：非 H5 端或关闭代理时直连后端端口也能携带 Cookie）。
 * 主链路是前端 H5 经 vite proxy 同源访问，故通常不会触发跨域。
 * 仅对 TRUSTED_ORIGINS 中的来源回显具体 Origin（不能与 credentials 同时用 *）。
 */
export default defineEventHandler((event) => {
  const pathname = (event.path ?? '').split('?')[0] ?? ''
  if (!pathname.startsWith('/api/')) return

  const origin = getRequestHeader(event, 'origin')
  if (origin && getTrustedOrigins().includes(origin)) {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
      'Access-Control-Max-Age': '86400'
    })
  }

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
