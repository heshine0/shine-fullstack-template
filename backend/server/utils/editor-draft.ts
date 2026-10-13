import { createApiError } from './errors'

/** 草稿 TTL：7 天（毫秒）。 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 草稿内容上限（字符数）。 */
export const DRAFT_CONTENT_MAX = 1_000_000

/** 判定草稿是否过期（基于 updatedAt）。 */
export function isDraftExpired(updatedAt: Date, now: number = Date.now()): boolean {
  return now - updatedAt.getTime() > DRAFT_TTL_MS
}

/**
 * 校验草稿属主：null 或非属主均抛 NOT_FOUND（不泄漏存在性）。
 */
export function assertDraftOwnership(
  draft: { userId: string } | null,
  userId: string
): asserts draft is { userId: string } {
  if (!draft) throw createApiError('NOT_FOUND')
  if (draft.userId !== userId) throw createApiError('NOT_FOUND')
}

/** 构建 7 天前的截止时间点，用于批量清理过期草稿的 WHERE 条件。 */
export function buildExpiryCutoff(now: number = Date.now()): Date {
  return new Date(now - DRAFT_TTL_MS)
}
