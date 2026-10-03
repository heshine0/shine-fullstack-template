import { getRoleNamesByUserId } from '../../../database/repositories/roles'
import {
  getUserById,
  getUserByPhone,
  setUserBanned,
  updateUserProfile
} from '../../../database/repositories/users'
import { userIdParamSchema, userUpdateBodySchema } from '../../../schemas/users'

/** 更新用户资料 / 启禁用（admin，含自我保护：不能停用自己）。 */
export default defineEventHandler(async (event) => {
  const current = requireAdmin(event)
  const { id } = parseParams(event, userIdParamSchema)
  const body = await parseBody(event, userUpdateBodySchema)

  const target = await getUserById(id)
  if (!target) throw createApiError('NOT_FOUND', { message: '用户不存在' })

  if (body.banned === true && target.id === current.id) {
    throw createApiError('FORBIDDEN', { message: '不能停用当前登录的自己' })
  }

  if (body.phoneNumber !== undefined) {
    const phone = body.phoneNumber
    if (phone && phone !== target.phoneNumber) {
      const dup = await getUserByPhone(phone)
      if (dup && dup.id !== id) throw createApiError('CONFLICT', { message: '该手机号已被使用' })
    }
  }

  if (body.name !== undefined || body.phoneNumber !== undefined) {
    await updateUserProfile(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phoneNumber !== undefined ? { phoneNumber: body.phoneNumber } : {})
    })
  }
  if (body.banned !== undefined) {
    await setUserBanned(id, body.banned)
  }

  const updated = await getUserById(id)
  return ok({ ...updated, roles: await getRoleNamesByUserId(id) })
})
