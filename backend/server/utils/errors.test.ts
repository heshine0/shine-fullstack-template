import { describe, expect, it } from 'vitest'
import { createApiError, ERROR_REGISTRY } from './errors'

describe('ERROR_REGISTRY', () => {
  it('maps codes to expected HTTP status', () => {
    expect(ERROR_REGISTRY.VALIDATION_ERROR.statusCode).toBe(422)
    expect(ERROR_REGISTRY.UNAUTHORIZED.statusCode).toBe(401)
    expect(ERROR_REGISTRY.FORBIDDEN.statusCode).toBe(403)
    expect(ERROR_REGISTRY.NOT_FOUND.statusCode).toBe(404)
    expect(ERROR_REGISTRY.CONFLICT.statusCode).toBe(409)
    expect(ERROR_REGISTRY.RATE_LIMITED.statusCode).toBe(429)
    expect(ERROR_REGISTRY.INTERNAL_ERROR.statusCode).toBe(500)
  })
})

describe('createApiError', () => {
  it('builds H3Error with statusCode and structured data', () => {
    const err = createApiError('NOT_FOUND')
    expect(err.statusCode).toBe(404)
    expect(err.data).toMatchObject({ code: 'NOT_FOUND' })
    expect(err.data?.message).toBeTruthy()
  })

  it('allows overriding message and attaching issues', () => {
    const err = createApiError('VALIDATION_ERROR', {
      message: '自定义失败',
      issues: [{ path: 'title', message: '必填' }]
    })
    expect(err.statusCode).toBe(422)
    expect(err.data).toMatchObject({ code: 'VALIDATION_ERROR', message: '自定义失败' })
    expect(Array.isArray(err.data?.issues)).toBe(true)
  })
})
