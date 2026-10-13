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

  // UEditor（@nuxt/ui 内置 Tiptap）与页面直接引入的 @tiptap/* 扩展必须落在同一个
  // vite 依赖预打包边界内；否则 prosemirror-state 会产生两份模块单例，
  // 编辑器初始化时报 "Adding different instances of a keyed plugin (plugin$)"。
  vite: {
    optimizeDeps: {
      include: [
        '@tiptap/core',
        '@tiptap/vue-3',
        '@tiptap/starter-kit',
        '@tiptap/extensions',
        '@tiptap/suggestion',
        '@tiptap/markdown',
        '@tiptap/pm/state',
        '@tiptap/pm/view',
        '@tiptap/pm/model',
        '@tiptap/pm/transform',
        '@tiptap/extension-blockquote',
        '@tiptap/extension-bold',
        '@tiptap/extension-bubble-menu',
        '@tiptap/extension-bullet-list',
        '@tiptap/extension-code',
        '@tiptap/extension-code-block',
        '@tiptap/extension-color',
        '@tiptap/extension-document',
        '@tiptap/extension-dropcursor',
        '@tiptap/extension-floating-menu',
        '@tiptap/extension-font-family',
        '@tiptap/extension-gapcursor',
        '@tiptap/extension-hard-break',
        '@tiptap/extension-heading',
        '@tiptap/extension-highlight',
        '@tiptap/extension-horizontal-rule',
        '@tiptap/extension-image',
        '@tiptap/extension-italic',
        '@tiptap/extension-link',
        '@tiptap/extension-list',
        '@tiptap/extension-list-item',
        '@tiptap/extension-list-keymap',
        '@tiptap/extension-mention',
        '@tiptap/extension-ordered-list',
        '@tiptap/extension-paragraph',
        '@tiptap/extension-placeholder',
        '@tiptap/extension-strike',
        '@tiptap/extension-text',
        '@tiptap/extension-text-align',
        '@tiptap/extension-text-style',
        '@tiptap/extension-underline',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-model',
        'prosemirror-transform',
        'prosemirror-commands',
        'prosemirror-keymap',
        'prosemirror-inputrules',
        'prosemirror-history',
        'prosemirror-schema-list',
        'prosemirror-dropcursor',
        'prosemirror-gapcursor'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
