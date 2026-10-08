import type Redis from 'ioredis'
import { getEnv } from './env'

/**
 * 通用缓存层：存储介质可经环境变量 CACHE_DRIVER 切换（memory | redis）。
 * - 纯工厂 createCache(driver) 不依赖环境变量，便于单测；
 * - getCache() 按环境变量惰性构造全局单例。
 * 值统一 JSON 序列化；TTL 为秒级，两种介质语义一致（惰性过期 / 原生 SETEX）。
 */

export interface CacheDriver {
  /** 读取原始字符串；不存在或已过期返回 null。 */
  get(key: string): Promise<string | null>
  /** 写入；ttlSeconds 缺省表示不过期。 */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  /** 删除；key 不存在时静默。 */
  del(key: string): Promise<void>
}

export interface Cache {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  remember<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T>
}

interface MemoryEnvelope {
  /** 实际存储的 JSON 字符串。 */
  v: string
  /** 绝对过期时间戳（ms）；null 表示不过期。 */
  e: number | null
}

/** 进程内内存驱动：Map + 绝对过期时间戳，get 时惰性清理。 */
export function createMemoryDriver(): CacheDriver {
  const data = new Map<string, MemoryEnvelope>()
  return {
    async get(key) {
      const item = data.get(key)
      if (!item) return null
      if (item.e !== null && item.e <= Date.now()) {
        data.delete(key)
        return null
      }
      return item.v
    },
    async set(key, value, ttlSeconds) {
      data.set(key, {
        v: value,
        e: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
      })
    },
    async del(key) {
      data.delete(key)
    }
  }
}

type RedisClient = InstanceType<typeof Redis>

/**
 * Redis 驱动：ioredis 懒加载（仅选择 redis 介质时动态 import），
 * key 加前缀隔离；TTL 走原生 SETEX。
 */
export function createRedisDriver(url: string, prefix: string): CacheDriver {
  let client: RedisClient | null = null

  async function getClient(): Promise<RedisClient> {
    if (client) return client
    const mod = await import('ioredis')
    client = new mod.default(url, { maxRetriesPerRequest: 2 })
    return client
  }

  const prefixed = (key: string) => (prefix ? `${prefix}:${key}` : key)

  return {
    async get(key) {
      return (await getClient()).get(prefixed(key))
    },
    async set(key, value, ttlSeconds) {
      const c = await getClient()
      if (ttlSeconds) await c.set(prefixed(key), value, 'EX', ttlSeconds)
      else await c.set(prefixed(key), value)
    },
    async del(key) {
      await (await getClient()).unlink(prefixed(key))
    }
  }
}

/**
 * 用指定驱动构造缓存实例。
 * @param options.defaultTtl set/remember 未显式传 TTL 时使用的默认秒数
 */
export function createCache(
  driver: CacheDriver,
  options: { defaultTtl?: number } = {}
): Cache {
  const { defaultTtl } = options

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await driver.get(key)
      return raw === null ? null : (JSON.parse(raw) as T)
    },

    async set(key, value, ttlSeconds = defaultTtl) {
      await driver.set(key, JSON.stringify(value), ttlSeconds)
    },

    async del(key) {
      await driver.del(key)
    },

    async remember(key, factory, ttlSeconds = defaultTtl) {
      const raw = await driver.get(key)
      if (raw !== null) return JSON.parse(raw)
      const value = await factory()
      await driver.set(key, JSON.stringify(value), ttlSeconds)
      return value
    }
  }
}

let singleton: Cache | null = null

/**
 * 按环境变量构造全局缓存单例：
 * CACHE_DRIVER=redis 但未提供 CACHE_REDIS_URL 时 fail-fast。
 */
export function getCache(): Cache {
  if (singleton) return singleton
  const env = getEnv()

  let driver: CacheDriver
  if (env.CACHE_DRIVER === 'redis') {
    if (!env.CACHE_REDIS_URL) {
      throw new Error('CACHE_DRIVER=redis 时必须提供 CACHE_REDIS_URL，请检查 .env')
    }
    driver = createRedisDriver(env.CACHE_REDIS_URL, env.CACHE_KEY_PREFIX)
  } else {
    driver = createMemoryDriver()
  }

  singleton = createCache(driver, { defaultTtl: env.CACHE_TTL })
  return singleton
}
