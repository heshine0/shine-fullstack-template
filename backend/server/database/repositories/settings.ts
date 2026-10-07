import { asc, eq } from 'drizzle-orm'
import { db } from '../client'
import { setting as settingTable, type setting } from '../schema'

export type Setting = typeof setting.$inferSelect
export type NewSetting = typeof setting.$inferInsert

/** 全部设置（按 key 字典序）。 */
export async function listSettings(): Promise<Setting[]> {
  return db.select().from(settingTable).orderBy(asc(settingTable.key))
}

export async function getSettingByKey(key: string): Promise<Setting | null> {
  const rows = await db.select().from(settingTable).where(eq(settingTable.key, key)).limit(1)
  return rows[0] ?? null
}

export async function settingExists(key: string): Promise<boolean> {
  const rows = await db
    .select({ key: settingTable.key })
    .from(settingTable)
    .where(eq(settingTable.key, key))
    .limit(1)
  return rows.length > 0
}

export async function createSetting(key: string, value: unknown): Promise<Setting> {
  const rows = await db.insert(settingTable).values({ key, value }).returning()
  return rows[0]!
}

export async function updateSettingValue(key: string, value: unknown): Promise<Setting | null> {
  const rows = await db
    .update(settingTable)
    .set({ value })
    .where(eq(settingTable.key, key))
    .returning()
  return rows[0] ?? null
}

export async function deleteSetting(key: string): Promise<Setting | null> {
  const rows = await db.delete(settingTable).where(eq(settingTable.key, key)).returning()
  return rows[0] ?? null
}

/** 全量设置键值映射（公开端点用）。 */
export async function getSettingsMap(): Promise<Record<string, unknown>> {
  const rows = await listSettings()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
