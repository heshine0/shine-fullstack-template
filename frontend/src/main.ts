import { createSSRApp } from 'vue'
import App from './App.vue'
import { requestInterceptor } from './http/interceptor'
import { routeInterceptor } from './router/interceptor'

import store from './store'
import '@/style/index.scss'
import 'virtual:uno.css'

export function createApp() {
  const app = createSSRApp(App)
  app.use(store)
  app.use(routeInterceptor)
  app.use(requestInterceptor)

  // 兼容第三方组件（mp-html editable 插件）对 Vue2 实例 API 的依赖：
  // Vue3 已移除 $set/$delete，这里在每个组件实例 created 时幂等补齐
  app.mixin({
    created() {
      // 运行时补齐 Vue2 API（@dcloudio 的 Vue3 类型仍保留 $set/$delete 声明，无需 ts-expect-error）
      if (!this.$set) {
        this.$set = <T extends object>(obj: T, key: PropertyKey, val: unknown) => {
          (obj as Record<PropertyKey, unknown>)[key] = val
          return val
        }
      }
      if (!this.$delete) {
        this.$delete = (obj: Record<PropertyKey, unknown>, key: PropertyKey) => {
          delete obj[key]
        }
      }
    },
  })

  return {
    app,
  }
}
