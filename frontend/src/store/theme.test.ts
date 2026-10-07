import { describe, expect, it } from 'vitest'
import {
  THEME_BRAND_OPTIONS,
  THEME_MODE_OPTIONS,
  useThemeStore,
} from './theme'

describe('theme store 默认状态', () => {
  it('默认为浅色模式 + default 品牌', () => {
    const theme = useThemeStore()
    expect(theme.mode).toBe('light')
    expect(theme.brand).toBe('default')
    expect(theme.resolvedMode).toBe('light')
    expect(theme.rootClass).toBe('theme-light brand-default')
  })

  it('选项表包含三档外观模式与两个品牌', () => {
    expect(THEME_MODE_OPTIONS.map(i => i.value)).toEqual(['light', 'dark', 'auto'])
    expect(THEME_BRAND_OPTIONS.map(i => i.value)).toEqual(['default', 'blue'])
  })
})

describe('setMode / setBrand', () => {
  it('切到深色后 resolvedMode 与 rootClass 同步', () => {
    const theme = useThemeStore()
    theme.setMode('dark')
    expect(theme.resolvedMode).toBe('dark')
    expect(theme.rootClass).toBe('theme-dark brand-default')
  })

  it('auto 模式跟随 systemMode：系统变深，解析结果随之变深', () => {
    const theme = useThemeStore()
    theme.setMode('auto')
    expect(theme.resolvedMode).toBe('light')

    // 模拟系统主题变化（真机由 matchMedia / uni.onThemeChange 回写）
    theme.systemMode = 'dark'
    expect(theme.resolvedMode).toBe('dark')
    expect(theme.rootClass).toBe('theme-dark brand-default')
  })

  it('切品牌只改 brand 部分，不影响模式 class', () => {
    const theme = useThemeStore()
    theme.setMode('dark')
    theme.setBrand('blue')
    expect(theme.rootClass).toBe('theme-dark brand-blue')
  })
})

describe('init', () => {
  it('重复调用幂等且不抛错（测试环境无 matchMedia 时降级 light）', () => {
    const theme = useThemeStore()
    expect(() => {
      theme.init()
      theme.init()
    }).not.toThrow()
    expect(theme.mode).toBe('light')
  })
})
