import { count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '../client'
import { post as postsTable, type post } from '../schema'

export type Post = typeof post.$inferSelect
export type NewPost = typeof post.$inferInsert

export interface ListParams {
  limit: number
  offset: number
  keyword?: string
}

export interface ListResult {
  rows: Post[]
  total: number
}

function keywordFilter(keyword?: string): SQL | undefined {
  const kw = keyword?.trim()
  if (!kw) return undefined
  const pattern = `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`
  return or(ilike(postsTable.title, pattern), ilike(postsTable.content, pattern))
}

export async function listPosts({ limit, offset, keyword }: ListParams): Promise<ListResult> {
  const filter = keywordFilter(keyword)
  const [rows, totalRows] = await Promise.all([
    db.select().from(postsTable).where(filter).orderBy(desc(postsTable.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(postsTable).where(filter)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

export async function getPostById(id: string): Promise<Post | null> {
  const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createPost(data: Pick<NewPost, 'title' | 'content' | 'published'>): Promise<Post> {
  const rows = await db.insert(postsTable).values(data).returning()
  return rows[0]!
}

export async function updatePost(
  id: string,
  data: Partial<Pick<NewPost, 'title' | 'content' | 'published'>>
): Promise<Post | null> {
  const rows = await db.update(postsTable).set(data).where(eq(postsTable.id, id)).returning()
  return rows[0] ?? null
}

export async function deletePost(id: string): Promise<Post | null> {
  const rows = await db.delete(postsTable).where(eq(postsTable.id, id)).returning()
  return rows[0] ?? null
}
