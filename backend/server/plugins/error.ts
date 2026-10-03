import type { H3Error, H3Event } from 'h3'
import { ERROR_REGISTRY, type ApiErrorData, type ApiErrorCode } from '../utils/errors'

/**
 * 全局错误兜底：把 /api/** 的未捕获错误统一序列化为
 * { code, message, issues? } 结构；非 /api（页面）交给 Nuxt 默认错误页。
 * h3 在响应已结束（event.handled）时会跳过默认 sendError，不会重复写入。
 */
const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED'
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, ctx) => {
    const event = ctx?.event as H3Event | undefined
    if (!event) return
    const pathname = (event.path ?? '').split('?')[0] ?? ''
    if (!pathname.startsWith('/api/')) return
    if (event.handled || event.node.res.headersSent || event.node.res.writableEnded) return

    const h3Error = error as H3Error
    const data = h3Error.data as Partial<ApiErrorData> | undefined

    const statusCode = typeof h3Error.statusCode === 'number' && h3Error.statusCode >= 400
      ? h3Error.statusCode
      : 500

    let payload: ApiErrorData
    if (data && typeof data === 'object' && typeof data.code === 'string') {
      payload = data as ApiErrorData
    } else {
      const code: ApiErrorCode = STATUS_TO_CODE[statusCode] ?? 'INTERNAL_ERROR'
      payload = { code, message: ERROR_REGISTRY[code].message }
    }

    if (statusCode >= 500) {
      logError(event, `${payload.code}: ${h3Error.message}`, { path: pathname })
    }

    setResponseStatus(event, statusCode, payload.message)
    setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
    event.node.res.end(JSON.stringify(payload))
  })
})
