import { http } from '@/http/alova'

/**
 * 全量设置键值映射（公开端点 GET /settings，无需登录）。
 * 启动加载失败时静默（toast:false），由调用方决定兜底策略。
 */
export function getSettings(): Promise<Record<string, unknown>> {
  return http.Get<Record<string, unknown>>('/settings', {
    meta: { toast: false },
  }) as unknown as Promise<Record<string, unknown>>
}
