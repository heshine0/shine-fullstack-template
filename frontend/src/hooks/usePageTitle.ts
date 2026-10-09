import { inject, provide, ref } from 'vue'
import type { InjectionKey, Ref } from 'vue'

interface PageTitleState {
  /** null 表示页面尚未给定标题，布局回退到 pages.json 的 navigationBarTitleText */
  title: Ref<string | null>
  setPageTitle: (value: string) => void
}

const PAGE_TITLE_KEY: InjectionKey<PageTitleState> = Symbol('pageTitle')

/**
 * 页面侧：创建当前页面实例专属的标题状态并 provide 给布局。
 *
 * uni-app 中布局组件是页面组件的子组件（页面模板被编译为
 * <layout-default-uni>{页面内容}</layout-default-uni>），故布局通过 inject 读取；
 * 每个页面实例持有自己的一份状态，页面返回 / switchTab 切回时实例与状态一并保留，
 * 标题天然恢复，不会跨页面残留。
 *
 * 必须在页面 setup 顶层调用一次。initial 用于静态标题；
 * 需要动态标题时不传 initial，用返回的 setPageTitle 在数据就绪后更新。
 */
export function usePageTitle(initial?: string) {
  const title = ref<string | null>(initial ?? null)

  const state: PageTitleState = {
    title,
    setPageTitle(value: string) {
      title.value = value
    },
  }

  provide(PAGE_TITLE_KEY, state)

  return {
    pageTitle: title,
    setPageTitle: state.setPageTitle,
  }
}

/**
 * 布局侧：inject 当前页面提供的标题状态。
 * 页面未调用 usePageTitle 时返回 null，布局回退到路径映射标题。
 */
export function useInjectedPageTitle() {
  return inject(PAGE_TITLE_KEY, null)
}
