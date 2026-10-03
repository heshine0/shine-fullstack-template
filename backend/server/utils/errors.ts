/**
 * 统一错误码注册表 + createApiError。
 *
 * 抛出的错误经 Nitro `error` 钩子（server/plugins/error.ts）
 * 序列化为统一结构：{ code, message, ...data }。
 */
import { createError, type H3Error } from 'h3'

export type ApiErrorCode
  = | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR'

interface ErrorDefinition {
  statusCode: number
  message: string
}

export const ERROR_REGISTRY: Record<ApiErrorCode, ErrorDefinition> = {
  VALIDATION_ERROR: { statusCode: 422, message: '请求参数校验失败' },
  UNAUTHORIZED: { statusCode: 401, message: '未登录或会话已失效' },
  FORBIDDEN: { statusCode: 403, message: '没有访问权限' },
  NOT_FOUND: { statusCode: 404, message: '资源不存在' },
  CONFLICT: { statusCode: 409, message: '资源冲突' },
  RATE_LIMITED: { statusCode: 429, message: '请求过于频繁，请稍后再试' },
  INTERNAL_ERROR: { statusCode: 500, message: '服务器内部错误' }
}

export interface ApiErrorData {
  code: ApiErrorCode
  message: string
  issues?: ApiIssue[]
  [key: string]: unknown
}

export interface ApiIssue {
  path: string
  message: string
}

/** createApiError 的附加数据（独立类型，避免 Omit 索引签名导致类型退化）。 */
export interface ApiErrorExtra {
  message?: string
  issues?: ApiIssue[]
}

/**
 * 构造一个携带统一错误负载的 H3Error。
 * @param code 错误码
 * @param extra 附加数据（如 VALIDATION_ERROR 的 issues，或自定义 message）
 */
export function createApiError(
  code: ApiErrorCode,
  extra: ApiErrorExtra = {}
): H3Error<ApiErrorData> {
  const def = ERROR_REGISTRY[code]
  const message = extra.message ?? def.message
  const { message: _ignored, ...rest } = extra
  return createError<ApiErrorData>({
    statusCode: def.statusCode,
    statusMessage: message,
    message,
    data: {
      code,
      message,
      ...rest
    }
  })
}
