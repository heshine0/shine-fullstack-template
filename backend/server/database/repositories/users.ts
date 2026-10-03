import { count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { db } from '../client'
import {
  account as accountTable,
  role as roleTable,
  user as userTable,
  userRole as userRoleTable,
  type user
} from '../schema'

export type User = typeof user.$inferSelect

export interface ListParams {
  limit: number
  offset: number
  keyword?: string
}

export interface ListResult {
  rows: User[]
  total: number
}

function keywordFilter(keyword?: string): SQL | undefined {
  const kw = keyword?.trim()
  if (!kw) return undefined
  const pattern = `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`
  return or(ilike(userTable.email, pattern), ilike(userTable.name, pattern), ilike(userTable.phoneNumber, pattern))
}

export async function listUsers({ limit, offset, keyword }: ListParams): Promise<ListResult> {
  const filter = keywordFilter(keyword)
  const [rows, totalRows] = await Promise.all([
    db.select().from(userTable).where(filter).orderBy(desc(userTable.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(userTable).where(filter)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(userTable).where(eq(userTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1)
  return rows[0] ?? null
}

export async function getUserByPhone(phoneNumber: string): Promise<User | null> {
  const rows = await db.select().from(userTable).where(eq(userTable.phoneNumber, phoneNumber)).limit(1)
  return rows[0] ?? null
}

/** 直接落库用户（管理员创建路径，不经过 better-auth，故不触发注册默认角色 hook）。 */
export async function insertUser(data: {
  id: string
  name: string
  email: string
  emailVerified?: boolean
  phoneNumber?: string | null
  banned?: boolean
}): Promise<User> {
  const rows = await db
    .insert(userTable)
    .values({
      id: data.id,
      name: data.name,
      email: data.email,
      emailVerified: data.emailVerified ?? true,
      phoneNumber: data.phoneNumber ?? null,
      phoneNumberVerified: false,
      banned: data.banned ?? false
    })
    .returning()
  return rows[0]!
}

/** 为用户创建邮箱密码凭据（providerId=credential，accountId=userId）。 */
export async function insertCredentialAccount(input: {
  userId: string
  passwordHash: string
}): Promise<void> {
  await db.insert(accountTable).values({
    id: crypto.randomUUID(),
    accountId: input.userId,
    providerId: 'credential',
    userId: input.userId,
    password: input.passwordHash
  })
}

/**
 * 事务型创建用户：user + credential account + 角色关联。
 * 唯一性与角色合法性由调用方提前校验；角色按传入 name 全量挂载（忽略不存在的）。
 */
export async function createUserWithRoles(input: {
  name: string
  email: string
  phoneNumber?: string | null
  passwordHash: string
  roles: string[]
}): Promise<{ user: User, roles: string[] }> {
  const userId = crypto.randomUUID()
  const created = await db.transaction(async (tx) => {
    const userRows = await tx
      .insert(userTable)
      .values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: true,
        phoneNumber: input.phoneNumber ?? null,
        phoneNumberVerified: false,
        banned: false
      })
      .returning()

    await tx.insert(accountTable).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: input.passwordHash
    })

    let assigned: string[] = []
    if (input.roles.length) {
      const roles = await tx.select().from(roleTable).where(inArray(roleTable.name, input.roles))
      assigned = roles.map(r => r.name)
      if (roles.length) {
        await tx
          .insert(userRoleTable)
          .values(roles.map(r => ({ userId, roleId: r.id })))
          .onConflictDoNothing()
      }
    }
    return { user: userRows[0]!, assigned }
  })
  return { user: created.user, roles: created.assigned }
}

export async function setUserBanned(id: string, banned: boolean): Promise<User | null> {
  const rows = await db.update(userTable).set({ banned }).where(eq(userTable.id, id)).returning()
  return rows[0] ?? null
}

export async function updateUserProfile(
  id: string,
  data: Partial<Pick<User, 'name' | 'image' | 'phoneNumber'>>
): Promise<User | null> {
  const rows = await db.update(userTable).set(data).where(eq(userTable.id, id)).returning()
  return rows[0] ?? null
}

export async function deleteUserById(id: string): Promise<User | null> {
  // session/account/user_role 经外键 cascade 自动清理
  const rows = await db.delete(userTable).where(eq(userTable.id, id)).returning()
  return rows[0] ?? null
}
