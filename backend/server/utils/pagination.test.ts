import { describe, expect, it } from 'vitest'
import { buildPaginationMeta, parsePagination } from './pagination'

describe('parsePagination', () => {
  it('uses defaults when input empty', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, limit: 20, offset: 0 })
  })

  it('coerces string query params and computes limit/offset', () => {
    expect(parsePagination({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
      limit: 10,
      offset: 20
    })
  })

  it('rejects page < 1', () => {
    expect(() => parsePagination({ page: 0 })).toThrow()
  })

  it('rejects pageSize > 100', () => {
    expect(() => parsePagination({ pageSize: 101 })).toThrow()
  })
})

describe('buildPaginationMeta', () => {
  it('returns raw meta fields', () => {
    expect(buildPaginationMeta(0, { page: 1, pageSize: 20 })).toEqual({
      page: 1,
      pageSize: 20,
      total: 0
    })
  })
})
