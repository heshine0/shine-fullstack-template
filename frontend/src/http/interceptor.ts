import type { CustomRequestOptions } from '@/http/types'
import { getEnvBaseUrl } from '@/utils'
import { stringifyQuery } from './tools/queryString'

// 请求基准地址（非 H5 端直连用）
const baseUrl = getEnvBaseUrl()
const proxyEnabled = JSON.parse(import.meta.env.VITE_APP_PROXY_ENABLE)
const proxyPrefix = import.meta.env.VITE_APP_PROXY_PREFIX

// 拦截器配置
const httpInterceptor = {
  // 拦截前触发
  invoke(options: CustomRequestOptions) {
    // alova 执行流程：alova beforeRequest --> 本拦截器 --> alova responded

    // 接口请求支持通过 query 参数配置 queryString
    if (options.query) {
      const queryStr = stringifyQuery(options.query)
      if (options.url.includes('?')) {
        options.url += `&${queryStr}`
      }
      else {
        options.url += `?${queryStr}`
      }
    }

    // 非 http 开头需拼接地址
    if (!options.url.startsWith('http')) {
      // #ifdef H5
      if (proxyEnabled) {
        // alova 的 baseURL 已含代理前缀 /api，这里仅对未带前缀的裸路径补齐，避免 /api/api 重复
        if (!options.url.startsWith(proxyPrefix)) {
          options.url = proxyPrefix + options.url
        }
      }
      else {
        options.url = baseUrl + options.url
      }
      // #endif

      // 非 H5（小程序/App）正常拼接后端基址
      // #ifndef H5
      options.url = baseUrl + options.url
      // #endif
    }

    // 1. 请求超时
    options.timeout = 60000 // 60s
    // 2. 透传自定义请求头
    options.header = {
      ...options.header,
    }
    // 3. Cookie 单通道：不注入 Authorization 之类的令牌头，
    //    会话凭证（better-auth.session_token）由浏览器/容器随同源请求自动携带。

    return options
  },
}

export const requestInterceptor = {
  install() {
    // 拦截 request 请求
    uni.addInterceptor('request', httpInterceptor)
    // 拦截 uploadFile 文件上传
    uni.addInterceptor('uploadFile', httpInterceptor)
  },
}
