<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { getCurrentInstance, onMounted, onUnmounted } from 'vue'
import { navigateToInterceptor } from '@/router/interceptor'
import { tabbarStore } from '@/tabbar/store'
import { permission } from '@/router/permission'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'

const { proxy } = (getCurrentInstance() || {}) as any
const router = proxy?.$router

router && permission.install(router)

onLaunch((options) => {
  console.log('App.vue onLaunch', options)
  // 恢复持久化的主题选择并监听系统深浅色变化（H5 同步 class 到 documentElement）
  useThemeStore().init()
  // 启动时用已有会话 Cookie 静默恢复登录态；未登录则安静停留在公开首页，
  // 进入受保护页或后续请求 401 时再引导登录。
  useAuthStore().fetchMe(true).catch(() => {})
})
onShow((options) => {
  console.log('App.vue onShow', options)
  // 处理直接进入页面路由的情况：如h5直接输入路由、微信小程序分享后进入等
  // https://github.com/unibest-tech/unibest/issues/192
  if (options?.path) {
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  }
  else {
    navigateToInterceptor.invoke({ url: '/' })
  }
})
onHide(() => {
  console.log('App Hide')
})

// #ifdef H5
function syncTabbarWhenPageVisible() {
  if (document.visibilityState === 'visible') {
    tabbarStore.syncCurIdxByCurrentPageAsync()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', syncTabbarWhenPageVisible)
  window.addEventListener('pageshow', syncTabbarWhenPageVisible)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', syncTabbarWhenPageVisible)
  window.removeEventListener('pageshow', syncTabbarWhenPageVisible)
})
// #endif
</script>

<style lang="scss">

</style>
