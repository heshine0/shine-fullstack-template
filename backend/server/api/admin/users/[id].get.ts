import { getRoleNamesByUserId } from '../../../database/repositories/roles'
import { getUserById } from '../../../database/repositories/users'
import { userIdParamSchema } from '../../../schemas/users'

/** 用户详情（admin）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, userIdParamSchema)
  const user = await getUserById(id)
  if (!user) throw createApiError('NOT_FOUND', { message: '用户不存在' })
  return ok({ ...user, roles: await getRoleNamesByUserId(id) })
})
