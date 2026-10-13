import { http } from '@/http/alova'

export interface DraftResult {
  id: string
  content: string
  updatedAt: string
}

/** 创建草稿。 */
export function createDraft(data: { content: string }): Promise<DraftResult> {
  return http.Post('/editor/drafts', data) as unknown as Promise<DraftResult>
}

/** 取草稿内容。 */
export function getDraft(id: string): Promise<DraftResult> {
  return http.Get(`/editor/drafts/${id}`) as unknown as Promise<DraftResult>
}

/** 更新草稿内容。 */
export function updateDraft(id: string, data: { content: string }): Promise<{ updatedAt: string }> {
  return http.Put(`/editor/drafts/${id}`, data) as unknown as Promise<{ updatedAt: string }>
}

/** 删除草稿。 */
export function deleteDraft(id: string): Promise<void> {
  return http.Delete(`/editor/drafts/${id}`) as unknown as Promise<void>
}
