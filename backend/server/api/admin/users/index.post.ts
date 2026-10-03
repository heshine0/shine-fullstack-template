import { hashPassword } from 'better-auth/crypto'
import { listRoles } from '../../../database/repositories/roles'
import { createUserWithRoles, getUserByEmail, getUserByPhone } from '../../../database/repositories/users'
import { userCreateBodySchema } from '../../../schemas/users'

/**
 * 管理员创建用户（admin）。
 * 走仓储直接入库（不触发 better-auth 注册 hook），角色由管理员显式分配；
 * 未传 roles 时默认挂 user。
 */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, userCreateBodySchema)
  const email = body.email.toLowerCase()

  if (await getUserByEmail(email)) {
    throw createApiError('CONFLICT', { message: '该邮箱已被使用' })
  }
  if (body.phoneNumber && await getUserByPhone(body.phoneNumber)) {
    throw createApiError('CONFLICT', { message: '该手机号已被使用' })
  }

  const desiredRoles = body.roles && body.roles.length ? [...new Set(body.roles)] : [DEFAULT_USER_ROLE]
  const validNames = new Set((await listRoles()).map(r => r.name))
  const invalid = desiredRoles.filter(name => !validNames.has(name))
  if (invalid.length) {
    throw createApiError('VALIDATION_ERROR', {
      message: `角色不存在：${invalid.join('、')}`,
      issues: invalid.map(name => ({ path: 'roles', message: `角色 ${name} 不存在` }))
    })
  }

  const passwordHash = await hashPassword(body.password)
  const { user, roles } = await createUserWithRoles({
    name: body.name,
    email,
    phoneNumber: body.phoneNumber,
    passwordHash,
    roles: desiredRoles
  })

  setResponseStatus(event, 201)
  return ok({ ...user, roles }, '用户创建成功')
})
