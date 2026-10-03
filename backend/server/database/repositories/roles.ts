import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../client'
import { role as roleTable, userRole as userRoleTable, type role } from '../schema'

export type Role = typeof role.$inferSelect
export type NewRole = typeof role.$inferInsert

export async function listRoles(): Promise<Role[]> {
  return db.select().from(roleTable).orderBy(asc(roleTable.createdAt))
}

export async function getRoleById(id: string): Promise<Role | null> {
  const rows = await db.select().from(roleTable).where(eq(roleTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getRoleByName(name: string): Promise<Role | null> {
  const rows = await db.select().from(roleTable).where(eq(roleTable.name, name)).limit(1)
  return rows[0] ?? null
}

export async function roleExists(name: string, exceptId?: string): Promise<boolean> {
  const rows = await db.select({ id: roleTable.id }).from(roleTable).where(eq(roleTable.name, name)).limit(1)
  if (rows.length === 0) return false
  if (exceptId && rows[0]!.id === exceptId) return false
  return true
}

export async function createRole(data: { name: string, description?: string }): Promise<Role> {
  const rows = await db.insert(roleTable).values(data).returning()
  return rows[0]!
}

export async function updateRole(
  id: string,
  data: Partial<Pick<NewRole, 'name' | 'description'>>
): Promise<Role | null> {
  const rows = await db.update(roleTable).set(data).where(eq(roleTable.id, id)).returning()
  return rows[0] ?? null
}

export async function deleteRole(id: string): Promise<Role | null> {
  // user_role 通过外键 onDelete cascade 自动清理
  const rows = await db.delete(roleTable).where(eq(roleTable.id, id)).returning()
  return rows[0] ?? null
}

/** 返回用户拥有的全部角色（含 id/name/description）。 */
export async function getRolesByUserId(userId: string): Promise<Role[]> {
  return db
    .select({
      id: roleTable.id,
      name: roleTable.name,
      description: roleTable.description,
      createdAt: roleTable.createdAt
    })
    .from(userRoleTable)
    .innerJoin(roleTable, eq(userRoleTable.roleId, roleTable.id))
    .where(eq(userRoleTable.userId, userId))
}

/** 返回用户角色 name 列表（授权判据）。 */
export async function getRoleNamesByUserId(userId: string): Promise<string[]> {
  const rows = await getRolesByUserId(userId)
  return rows.map(r => r.name)
}

/** 批量获取多个用户的角色 name 映射（用户列表分页用，避免 N+1）。 */
export async function getRoleNamesMapByUserIds(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (userIds.length === 0) return map
  const rows = await db
    .select({ userId: userRoleTable.userId, name: roleTable.name })
    .from(userRoleTable)
    .innerJoin(roleTable, eq(userRoleTable.roleId, roleTable.id))
    .where(inArray(userRoleTable.userId, userIds))
  for (const row of rows) {
    const list = map.get(row.userId)
    if (list) list.push(row.name)
    else map.set(row.userId, [row.name])
  }
  return map
}

/** 按角色 name 为用户追加角色（已存在则忽略）。角色不存在时静默跳过。 */
export async function ensureUserRoleByName(userId: string, roleName: string): Promise<void> {
  const roleRow = await getRoleByName(roleName)
  if (!roleRow) return
  await db
    .insert(userRoleTable)
    .values({ userId, roleId: roleRow.id })
    .onConflictDoNothing()
}

/**
 * 全量设置用户角色（事务内先删后增）。
 * 仅分配当前实际存在的角色，返回最终角色 name 列表。
 */
export async function setUserRoles(userId: string, roleNames: string[]): Promise<string[]> {
  const uniqueNames = [...new Set(roleNames.map(n => n.trim()).filter(Boolean))]
  const roles = uniqueNames.length
    ? await db.select().from(roleTable).where(inArray(roleTable.name, uniqueNames))
    : []
  await db.transaction(async (tx) => {
    await tx.delete(userRoleTable).where(eq(userRoleTable.userId, userId))
    if (roles.length) {
      await tx
        .insert(userRoleTable)
        .values(roles.map(r => ({ userId, roleId: r.id })))
        .onConflictDoNothing()
    }
  })
  return roles.map(r => r.name)
}

export async function countUsersForRole(roleId: string): Promise<number> {
  const rows = await db
    .selectDistinct({ id: userRoleTable.userId })
    .from(userRoleTable)
    .where(eq(userRoleTable.roleId, roleId))
    .limit(100000)
  return rows.length
}
