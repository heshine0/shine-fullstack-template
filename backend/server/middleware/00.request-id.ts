/**
 * 为每个请求注入 requestId（优先沿用入站 x-request-id），
 * 并回写到响应头，便于日志与排障关联。
 */
export default defineEventHandler((event) => {
  const incoming = getRequestHeader(event, 'x-request-id')
  const requestId
    = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : crypto.randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)
})
