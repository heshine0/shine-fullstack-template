// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true }
  },

  // 后端端口默认 3000，可用 backend/.env 的 PORT 覆盖（Nuxt 会在加载配置前把 .env 注入 process.env）
  // 前端 H5 默认 9000 经 dev proxy 同源访问；修改端口请用根目录 scripts/init-template.mjs 一次性同步
  devServer: {
    port: Number(process.env.PORT ?? 3000)
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
