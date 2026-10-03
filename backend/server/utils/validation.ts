import type { z } from 'zod'
import { createApiError } from './errors'

/**
 * 统一 Zod 校验入口：
 * 失败时抛出 VALIDATION_ERROR(422)，issues 携带字段级错误明细。
 */
export function parseSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown
): z.output<TSchema> {
  const result = schema.safeParse(data ?? {})
  if (!result.success) {
    throw createApiError('VALIDATION_ERROR', {
      issues: result.error.issues.map(i => ({
        path: i.path.map(String).join('.'),
        message: i.message
      }))
    })
  }
  return result.data
}

/** 解析并校验 JSON 请求体。 */
export async function parseBody<TSchema extends z.ZodType>(
  event: Parameters<typeof readBody>[0],
  schema: TSchema
): Promise<z.output<TSchema>> {
  const body = await readBody(event)
  return parseSchema(schema, body)
}

/** 解析并校验查询字符串。 */
export function parseQuery<TSchema extends z.ZodType>(
  event: Parameters<typeof getQuery>[0],
  schema: TSchema
): z.output<TSchema> {
  return parseSchema(schema, getQuery(event))
}

/** 解析并校验路由参数。 */
export function parseParams<TSchema extends z.ZodType>(
  event: Parameters<typeof getRouterParams>[0],
  schema: TSchema
): z.output<TSchema> {
  return parseSchema(schema, getRouterParams(event))
}
