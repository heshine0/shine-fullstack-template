import { and, eq, lt } from 'drizzle-orm'
import { db } from '../client'
import { editorDraft } from '../schema'
import { buildExpiryCutoff } from '../../utils/editor-draft'

export type EditorDraftRow = typeof editorDraft.$inferSelect

export async function createDraft(data: {
  id: string
  userId: string
  content: string
}): Promise<EditorDraftRow> {
  const rows = await db.insert(editorDraft).values(data).returning()
  return rows[0]!
}

export async function getDraftById(id: string): Promise<EditorDraftRow | null> {
  const rows = await db.select().from(editorDraft).where(eq(editorDraft.id, id)).limit(1)
  return rows[0] ?? null
}

export async function updateDraftContent(
  id: string,
  content: string
): Promise<EditorDraftRow | null> {
  const rows = await db
    .update(editorDraft)
    .set({ content, updatedAt: new Date() })
    .where(eq(editorDraft.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteDraftById(id: string): Promise<EditorDraftRow | null> {
  const rows = await db.delete(editorDraft).where(eq(editorDraft.id, id)).returning()
  return rows[0] ?? null
}

/** 删除指定用户的过期草稿（惰性清理，POST 创建时顺带调用）。 */
export async function deleteExpiredDraftsByUser(userId: string): Promise<void> {
  const cutoff = buildExpiryCutoff()
  await db.delete(editorDraft).where(
    and(eq(editorDraft.userId, userId), lt(editorDraft.updatedAt, cutoff))
  )
}
