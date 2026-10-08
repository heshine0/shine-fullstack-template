import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache, createMemoryDriver } from './cache'

describe('cache（memory 驱动）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('存取 JSON 值（对象/原始类型），未命中返回 null', async () => {
    const cache = createCache(createMemoryDriver())
    await cache.set('obj', { a: 1, b: ['x'] })
    await cache.set('str', 'hello')

    expect(await cache.get('obj')).toEqual({ a: 1, b: ['x'] })
    expect(await cache.get('str')).toBe('hello')
    expect(await cache.get('missing')).toBeNull()
  })

  it('del 删除缓存键', async () => {
    const cache = createCache(createMemoryDriver())
    await cache.set('k', 1)
    await cache.del('k')
    expect(await cache.get('k')).toBeNull()
    // 删除不存在的 key 不报错
    await cache.del('not-exist')
  })

  it('TTL 到期后惰性过期；未设 TTL 的键不受影响', async () => {
    const cache = createCache(createMemoryDriver())
    await cache.set('ttl', 1, 10)
    await cache.set('keep', 2)

    vi.advanceTimersByTime(9999)
    expect(await cache.get('ttl')).toBe(1)

    vi.advanceTimersByTime(1)
    expect(await cache.get('ttl')).toBeNull()
    expect(await cache.get('keep')).toBe(2)
  })

  it('remember 命中缓存后不再调用 factory；del 后重新加载', async () => {
    const cache = createCache(createMemoryDriver())
    const factory = vi.fn().mockResolvedValue('value')

    expect(await cache.remember('k', factory)).toBe('value')
    expect(await cache.remember('k', factory)).toBe('value')
    expect(factory).toHaveBeenCalledTimes(1)

    await cache.del('k')
    expect(await cache.remember('k', factory)).toBe('value')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('未显式传 TTL 时使用 defaultTtl', async () => {
    const cache = createCache(createMemoryDriver(), { defaultTtl: 5 })
    await cache.remember('k', async () => 'value')

    vi.advanceTimersByTime(4999)
    expect(await cache.get('k')).toBe('value')
    vi.advanceTimersByTime(1)
    expect(await cache.get('k')).toBeNull()
  })
})
