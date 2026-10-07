import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/**
 * 外观模式：浅色 / 深色 / 跟随系统（auto 解析为 light|dark）
 */
export type ThemeMode = 'light' | 'dark' | 'auto'
/**
 * 品牌主题。扩展新品牌：
 * 1) 在此联合类型加值；2) src/style/themes.scss 加 .brand-xxx 变量组；
 * 3) THEME_BRAND_OPTIONS 加选项。页面代码无需改动。
 */
export type ThemeBrand = 'default' | 'blue'

export const THEME_MODE_OPTIONS: ReadonlyArray<{ value: ThemeMode, label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '跟随系统' },
]

export const THEME_BRAND_OPTIONS: ReadonlyArray<{ value: ThemeBrand, label: string }> = [
  { value: 'default', label: '武协绿' },
  { value: 'blue', label: '商务蓝' },
]

const THEME_MODE_CLASSES = ['theme-light', 'theme-dark']
const THEME_BRAND_CLASSES = THEME_BRAND_OPTIONS.map(item => `brand-${item.value}`)

/**
 * 主题状态（uni storage 持久化，key 为 'theme'）。
 * 生效方式：rootClass 绑定在 App.ku.vue 根节点（全平台，CSS 变量继承），
 * H5 端 init() 时额外同步到 document.documentElement，使 page 背景等也跟随。
 */
export const useThemeStore = defineStore(
  'theme',
  () => {
    /** 用户选择的外观模式，默认浅色 */
    const mode = ref<ThemeMode>('light')
    /** 品牌主题，默认武协绿 */
    const brand = ref<ThemeBrand>('default')
    /** 系统当前深浅色；不支持读取的平台恒为 light */
    const systemMode = ref<'light' | 'dark'>('light')

    let initialized = false

    /** auto 模式解析后的实际明暗 */
    const resolvedMode = computed<'light' | 'dark'>(() =>
      mode.value === 'auto' ? systemMode.value : mode.value,
    )

    /** 绑定到根节点的主题 class（同时承载模式与品牌两个变量作用域） */
    const rootClass = computed(() => `theme-${resolvedMode.value} brand-${brand.value}`)

    // #ifdef H5
    function syncDocumentClass() {
      const root = document.documentElement
      root.classList.remove(...THEME_MODE_CLASSES, ...THEME_BRAND_CLASSES)
      root.classList.add(`theme-${resolvedMode.value}`, `brand-${brand.value}`)
    }
    // #endif

    /**
     * 应用启动时调用一次：读取系统主题、注册系统主题变化监听、同步 H5 根 class。
     * 幂等，重复调用不会重复注册监听。
     */
    function init() {
      if (initialized)
        return
      initialized = true

      // #ifdef H5
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mql = window.matchMedia('(prefers-color-scheme: dark)')
        systemMode.value = mql.matches ? 'dark' : 'light'
        mql.addEventListener('change', (e) => {
          systemMode.value = e.matches ? 'dark' : 'light'
        })
      }
      watch(rootClass, syncDocumentClass, { immediate: true })
      // #endif

      // #ifndef H5
      // 小程序/App 启动时读一次系统主题（微信字段为 hostTheme，其余平台兜底 theme）
      try {
        const info = uni.getSystemInfoSync() as { hostTheme?: string, theme?: string }
        const current = info.hostTheme || info.theme
        if (current === 'dark' || current === 'light')
          systemMode.value = current
      }
      catch {
        // 平台不支持时保持 light 兜底
      }
      // #endif

      // #ifdef MP-WEIXIN
      // 微信：系统深浅色切换事件（需 app.json 开启 darkmode 才会触发，未开启时静默降级）
      try {
        const onThemeChange = (uni as unknown as {
          onThemeChange?: (cb: (res: { theme?: string }) => void) => void
        }).onThemeChange
        onThemeChange?.((res) => {
          if (res.theme === 'dark' || res.theme === 'light')
            systemMode.value = res.theme
        })
      }
      catch {
        // 忽略不支持的基础库
      }
      // #endif
    }

    function setMode(value: ThemeMode) {
      mode.value = value
    }

    function setBrand(value: ThemeBrand) {
      brand.value = value
    }

    return {
      mode,
      brand,
      systemMode,
      resolvedMode,
      rootClass,
      init,
      setMode,
      setBrand,
    }
  },
  {
    // pinia-plugin-persistedstate：持久化用户选择；systemMode 每次启动重新探测
    persist: {
      paths: ['mode', 'brand'],
    },
  },
)
