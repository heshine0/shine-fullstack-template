import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as settingsApi from '@/api/settings'

/**
 * 全局设置存储（内存态，不持久化）。
 * 每次应用启动强制拉取最新设置；加载失败时 items 保持空对象，
 * 业务侧应通过 get(key, fallback) 提供兜底值。
 */
export const useSettingsStore = defineStore('settings', () => {
  const items = ref<Record<string, unknown>>({})
  const loaded = ref(false)

  /** 拉取全量设置并写入 store。 */
  async function fetchSettings(): Promise<Record<string, unknown>> {
    const data = await settingsApi.getSettings()
    items.value = data
    loaded.value = true
    return data
  }

  /**
   * 读取单个设置。
   * @param fallback 设置不存在或值为 undefined 时的兜底值
   */
  function get<T>(key: string): T | undefined
  function get<T>(key: string, fallback: T): T
  function get<T>(key: string, fallback?: T): T | undefined {
    const value = items.value[key]
    return value === undefined ? fallback : (value as T)
  }

  return {
    items,
    loaded,
    fetchSettings,
    get,
  }
})
