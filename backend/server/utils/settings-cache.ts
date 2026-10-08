import { getSettingsMap } from '../database/repositories/settings'
import { getCache } from './cache'

/** settings 全量 map 在缓存中的键。 */
export const SETTINGS_CACHE_KEY = 'settings:map'

/**
 * 获取全量设置键值映射（缓存优先）：
 * 未命中时回源 DB（getSettingsMap）并回填，TTL 取 CACHE_TTL 默认值兜底。
 */
export function getCachedSettingsMap(): Promise<Record<string, unknown>> {
  return getCache().remember(SETTINGS_CACHE_KEY, getSettingsMap)
}

/** 获取设置行列表（admin）：由缓存 map 派生，按 key 字典序排列。 */
export async function getCachedSettingsList(): Promise<{ key: string, value: unknown }[]> {
  const map = await getCachedSettingsMap()
  return Object.keys(map)
    .sort()
    .map(key => ({ key, value: map[key] }))
}

/** settings 写入成功后主动失效缓存，保证后续读取立即拿到最新值。 */
export function invalidateSettingsCache(): Promise<void> {
  return getCache().del(SETTINGS_CACHE_KEY)
}
