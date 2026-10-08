import { getRoleNamesByUserId, listRoles } from '../database/repositories/roles'
import { getCache } from './cache'

/** 角色全量列表在缓存中的键。 */
export const ROLES_LIST_CACHE_KEY = 'roles:list'

/** 用户角色名列表键（授权判据，按用户隔离）。 */
const userRolesKey = (userId: string) => `user-roles:${userId}`

/**
 * 用户角色缓存 TTL（秒）：授权安全敏感，取较短兜底，
 * 角色改名/删除等极少操作后最迟此时长生效（正常分配角色走主动失效）。
 */
const USER_ROLES_TTL = 120

/** 获取角色全量列表（缓存优先），未命中回源 DB 并回填。 */
export function getCachedRolesList() {
  return getCache().remember(ROLES_LIST_CACHE_KEY, listRoles)
}

/** 获取用户角色 name 列表（缓存优先），短 TTL。 */
export function getCachedUserRoleNames(userId: string): Promise<string[]> {
  return getCache().remember(
    userRolesKey(userId),
    () => getRoleNamesByUserId(userId),
    USER_ROLES_TTL
  )
}

/** 角色增删改成功后失效角色列表缓存。 */
export function invalidateRolesListCache(): Promise<void> {
  return getCache().del(ROLES_LIST_CACHE_KEY)
}

/** 为用户重新分配角色成功后失效该用户的角色缓存。 */
export function invalidateUserRolesCache(userId: string): Promise<void> {
  return getCache().del(userRolesKey(userId))
}
