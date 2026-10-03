import { describe, expect, it } from 'vitest'
import { ok, paginated } from './response'

describe('ok', () => {
  it('wraps data with code OK', () => {
    expect(ok({ id: 1 })).toEqual({ code: 'OK', data: { id: 1 } })
  })

  it('supports a custom message', () => {
    expect(ok(null, '已删除')).toEqual({ code: 'OK', data: null, message: '已删除' })
  })
})

describe('paginated', () => {
  it('computes totalPages = ceil(total/pageSize)', () => {
    const res = paginated([{ id: 1 }], { page: 2, pageSize: 10, total: 21 })
    expect(res.code).toBe('OK')
    expect(res.data).toEqual([{ id: 1 }])
    expect(res.pagination).toMatchObject({ page: 2, pageSize: 10, total: 21, totalPages: 3 })
  })

  it('reports at least one page when empty', () => {
    const res = paginated([], { page: 1, pageSize: 20, total: 0 })
    expect(res.pagination).toMatchObject({ total: 0, totalPages: 1 })
  })
})
