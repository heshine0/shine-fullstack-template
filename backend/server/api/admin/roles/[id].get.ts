import { getRoleById } from '../../../database/repositories/roles'
import { roleIdParamSchema } from '../../../schemas/roles'

/** 角色详情（admin）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, roleIdParamSchema)
  const roleRow = await getRoleById(id)
  if (!roleRow) throw createApiError('NOT_FOUND', { message: '角色不存在' })
  return ok(roleRow)
})
