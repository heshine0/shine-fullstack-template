import { setUserRoles } from '../../../../database/repositories/roles'
import { getUserById } from '../../../../database/repositories/users'
import { userIdParamSchema, userRolesBodySchema } from '../../../../schemas/users'
import { getCachedRolesList, invalidateUserRolesCache } from '../../../../utils/roles-cache'

/** 全量分配用户角色（admin，含自我保护：不能摘除自身 admin 角色）。 */
export default defineEventHandler(async (event) => {
  const current = requireAdmin(event)
  const { id } = parseParams(event, userIdParamSchema)
  const body = await parseBody(event, userRolesBodySchema)

  const target = await getUserById(id)
  if (!target) throw createApiError('NOT_FOUND', { message: '用户不存在' })

  const names = [...new Set(body.roles)]
  const validNames = new Set((await getCachedRolesList()).map(r => r.name))
  const invalid = names.filter(name => !validNames.has(name))
  if (invalid.length) {
    throw createApiError('VALIDATION_ERROR', {
      message: `角色不存在：${invalid.join('、')}`,
      issues: invalid.map(name => ({ path: 'roles', message: `角色 ${name} 不存在` }))
    })
  }

  if (target.id === current.id && !names.includes(ADMIN_ROLE)) {
    throw createApiError('FORBIDDEN', { message: '不能移除自身的管理员角色' })
  }

  const roles = await setUserRoles(id, names)
  await invalidateUserRolesCache(id)
  return ok({ id, roles }, '角色已更新')
})
