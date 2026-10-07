import { z } from 'zod'

/**
 * 判断是否为可直接 JSON 序列化的值：
 * object（plain）/array/string/number（有限）/boolean/null；
 * 拒绝 undefined、函数、symbol、循环引用外的非 plain object（如 Date/Map 类实例）。
 */
export function isJsonValue(value: unknown): boolean {
  if (value === null) return true
  const type = typeof value
  if (type === 'string' || type === 'boolean') return true
  if (type === 'number') return Number.isFinite(value)
  if (type !== 'object') return false
  if (Array.isArray(value)) return value.every(isJsonValue)
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (!isJsonValue(v)) return false
  }
  return true
}

// key 为稳定英文码：字母开头，可含数字/下划线/连字符/点，长度 ≤64
export const settingKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_.-]{0,63}$/i, '字母开头，仅含字母、数字、下划线、连字符、点，长度 ≤ 64')

export const settingValueSchema = z.any().refine(isJsonValue, {
  message: '必须是合法的 JSON 值（对象、数组、字符串、数字、布尔或 null）'
})

export const settingCreateBodySchema = z
  .object({
    key: settingKeySchema,
    value: settingValueSchema
  })
  .strict()

export const settingUpdateBodySchema = z
  .object({ value: settingValueSchema })
  .strict()

export const settingKeyParamSchema = z.object({
  key: z.string().min(1).max(64)
})
