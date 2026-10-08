import { deleteRole, getRoleById } from '../../../database/repositories/roles'
import { roleIdParamSchema } from '../../../schemas/roles'
import { invalidateRolesListCache } from '../../../utils/roles-cache'

const BUILTIN_ROLE_NAMES = [ADMIN_ROLE, DEFAULT_USER_ROLE]

/** 删除角色（admin）：内置角色不可删除；user_role 关联经外键 cascade 清理。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, roleIdParamSchema)
  const target = await getRoleById(id)
  if (!target) throw createApiError('NOT_FOUND', { message: '角色不存在' })
  if (BUILTIN_ROLE_NAMES.includes(target.name)) {
    throw createApiError('CONFLICT', { message: '内置角色不可删除' })
  }
  await deleteRole(id)
  // 删除角色后，各用户 user-roles 缓存依赖短 TTL（120s）自然过期
  await invalidateRolesListCache()
  return ok({ id }, '角色已删除')
})
