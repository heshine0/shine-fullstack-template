import { describe, it, expect } from 'vitest'
import { isDraftExpired, assertDraftOwnership, buildExpiryCutoff, DRAFT_TTL_MS } from './editor-draft'

describe('editor-draft', () => {
  const NOW = new Date('2026-10-13T12:00:00Z').getTime()

  it('isDraftExpired: 7 天内未过期', () => {
    expect(isDraftExpired(new Date('2026-10-13T11:00:00Z'), NOW)).toBe(false)
    expect(isDraftExpired(new Date('2026-10-06T12:00:01Z'), NOW)).toBe(false)
  })

  it('isDraftExpired: 超过 7 天判定过期', () => {
    expect(isDraftExpired(new Date('2026-10-06T11:59:59Z'), NOW)).toBe(true)
    expect(isDraftExpired(new Date('2026-10-01T00:00:00Z'), NOW)).toBe(true)
  })

  it('assertDraftOwnership: null 草稿抛错', () => {
    expect(() => assertDraftOwnership(null, 'user1')).toThrow()
  })

  it('assertDraftOwnership: 非属主抛错', () => {
    expect(() => assertDraftOwnership({ userId: 'user1' }, 'user2')).toThrow()
  })

  it('assertDraftOwnership: 属主通过', () => {
    expect(() => assertDraftOwnership({ userId: 'user1' }, 'user1')).not.toThrow()
  })

  it('buildExpiryCutoff: 返回 7 天前的时间', () => {
    const cutoff = buildExpiryCutoff(NOW)
    expect(cutoff.getTime()).toBe(NOW - DRAFT_TTL_MS)
  })
})
