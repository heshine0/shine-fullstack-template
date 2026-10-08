import { getRoleById, roleExists, updateRole } from '../../../database/repositories/roles'
import { roleIdParamSchema, roleUpdateBodySchema } from '../../../schemas/roles'
import { invalidateRolesListCache } from '../../../utils/roles-cache'

const BUILTIN_ROLE_NAMES = [ADMIN_ROLE, DEFAULT_USER_ROLE]

/** 更新角色（admin）：内置角色不可重命名，仅可改描述；name 需唯一。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, roleIdParamSchema)
  const body = await parseBody(event, roleUpdateBodySchema)

  const target = await getRoleById(id)
  if (!target) throw createApiError('NOT_FOUND', { message: '角色不存在' })

  if (body.name && body.name !== target.name && BUILTIN_ROLE_NAMES.includes(target.name)) {
    throw createApiError('CONFLICT', { message: '内置角色不可重命名' })
  }
  if (body.name && body.name !== target.name && await roleExists(body.name, id)) {
    throw createApiError('CONFLICT', { message: `角色 ${body.name} 已存在` })
  }

  const updated = await updateRole(id, body)
  // 角色改名后，各用户 user-roles 缓存依赖短 TTL（120s）自然过期
  await invalidateRolesListCache()
  return ok(updated)
})
