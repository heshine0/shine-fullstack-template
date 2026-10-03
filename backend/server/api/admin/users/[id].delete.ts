import { deleteUserById, getUserById } from '../../../database/repositories/users'
import { userIdParamSchema } from '../../../schemas/users'

/** 删除用户（admin，含自我保护：不能删除自己）。 */
export default defineEventHandler(async (event) => {
  const current = requireAdmin(event)
  const { id } = parseParams(event, userIdParamSchema)

  const target = await getUserById(id)
  if (!target) throw createApiError('NOT_FOUND', { message: '用户不存在' })
  if (target.id === current.id) {
    throw createApiError('FORBIDDEN', { message: '不能删除当前登录的自己' })
  }

  await deleteUserById(id)
  return ok({ id }, '用户已删除')
})
