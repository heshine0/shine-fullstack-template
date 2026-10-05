import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../client'
import { mediaFile as mediaTable, type mediaFile } from '../schema'
import type { MediaMetadata, MediaType } from '../../utils/media'

export type MediaFileRow = typeof mediaFile.$inferSelect
export type NewMediaFile = typeof mediaFile.$inferInsert

export interface ListMediaParams {
  limit: number
  offset: number
  type?: MediaType
  keyword?: string
}

export interface ListMediaResult {
  rows: MediaFileRow[]
  total: number
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, m => `\\${m}`)
}

function keywordFilter(keyword?: string): SQL | undefined {
  const kw = keyword?.trim()
  if (!kw) return undefined
  const pattern = `%${escapeLikePattern(kw)}%`
  return or(
    ilike(mediaTable.url, pattern),
    sql`${mediaTable.metadata}->>'name' ILIKE ${pattern} ESCAPE '\\'`
  )
}

export async function listMedia({ limit, offset, type, keyword }: ListMediaParams): Promise<ListMediaResult> {
  const filters = [type ? eq(mediaTable.type, type) : undefined, keywordFilter(keyword)]
  const where = filters.length ? and(...filters) : undefined

  const [rows, totalRows] = await Promise.all([
    db.select().from(mediaTable).where(where).orderBy(desc(mediaTable.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(mediaTable).where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

export async function getMediaFileById(id: string): Promise<MediaFileRow | null> {
  const rows = await db.select().from(mediaTable).where(eq(mediaTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getMediaFileByUrl(url: string): Promise<MediaFileRow | null> {
  const rows = await db.select().from(mediaTable).where(eq(mediaTable.url, url)).limit(1)
  return rows[0] ?? null
}

export async function createMediaFile(data: {
  url: string
  type: MediaType
  metadata: MediaMetadata
}): Promise<MediaFileRow> {
  const rows = await db.insert(mediaTable).values(data).returning()
  return rows[0]!
}

export async function deleteMediaFileById(id: string): Promise<MediaFileRow | null> {
  const rows = await db.delete(mediaTable).where(eq(mediaTable.id, id)).returning()
  return rows[0] ?? null
}

/**
 * 内部维护引用计数（不对应任何 HTTP 接口）。
 * SQL 层 greatest(0, ...) 钳底，不允许出现负值。
 */
export async function adjustRefCount(id: string, delta: number): Promise<MediaFileRow | null> {
  const rows = await db
    .update(mediaTable)
    .set({ refCount: sql`greatest(0, ${mediaTable.refCount} + ${delta})` })
    .where(eq(mediaTable.id, id))
    .returning()
  return rows[0] ?? null
}
