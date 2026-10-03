import type { user } from '../database/schema'
import { ADMIN_ROLE } from './auth'

/** 经认证中间件解析出的登录用户（含 phoneNumber / banned 等字段）。 */
export type SessionUser = typeof user.$inferSelect

interface SessionInfo {
  id: string
  token: string
  userId: string
  expiresAt: Date
}

interface AuthContextShape {
  user?: SessionUser | null
  session?: SessionInfo | null
  roles?: string[]
}

function ctx(event: { context: unknown }): AuthContextShape {
  return (event.context ?? {}) as AuthContextShape
}

/** 当前登录用户，未登录返回 null。 */
export function getAuthUser(event: Parameters<typeof ctx>[0]): SessionUser | null {
  return ctx(event).user ?? null
}

/** 要求已登录，否则 401。 */
export function requireUser(event: Parameters<typeof ctx>[0]): SessionUser {
  const userRow = ctx(event).user
  if (!userRow) throw createApiError('UNAUTHORIZED')
  return userRow
}

/** 当前用户角色 name 列表。 */
export function getRoleNames(event: Parameters<typeof ctx>[0]): string[] {
  return ctx(event).roles ?? []
}

export function isAdmin(event: Parameters<typeof ctx>[0]): boolean {
  return getRoleNames(event).includes(ADMIN_ROLE)
}

/** 要求具备 admin 角色，否则 403。 */
export function requireAdmin(event: Parameters<typeof ctx>[0]): SessionUser {
  const userRow = requireUser(event)
  if (!getRoleNames(event).includes(ADMIN_ROLE)) throw createApiError('FORBIDDEN')
  return userRow
}
