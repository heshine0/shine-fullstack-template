import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { parseSchema } from './validation'

const sample = z.object({
  title: z.string().min(1),
  count: z.coerce.number().int().default(1)
}).strict()

describe('parseSchema', () => {
  it('returns parsed value with defaults on success', () => {
    expect(parseSchema(sample, { title: 'hello' })).toEqual({ title: 'hello', count: 1 })
  })

  it('coerces numeric strings', () => {
    expect(parseSchema(sample, { title: 'hello', count: '3' })).toEqual({ title: 'hello', count: 3 })
  })

  it('throws a 422 VALIDATION_ERROR with issues on invalid input', () => {
    try {
      parseSchema(sample, { count: 'x' })
      throw new Error('should have thrown')
    } catch (err) {
      const e = err as { statusCode?: number, data?: { code?: string, issues?: unknown[] } }
      expect(e.statusCode).toBe(422)
      expect(e.data?.code).toBe('VALIDATION_ERROR')
      expect(Array.isArray(e.data?.issues)).toBe(true)
    }
  })

  it('rejects unknown keys on strict objects', () => {
    expect(() => parseSchema(sample, { title: 'x', nope: 1 })).toThrow()
  })
})
