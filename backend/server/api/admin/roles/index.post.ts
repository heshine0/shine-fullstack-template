import { createRole, roleExists } from '../../../database/repositories/roles'
import { roleCreateBodySchema } from '../../../schemas/roles'
import { invalidateRolesListCache } from '../../../utils/roles-cache'

/** 创建角色（admin）。 */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, roleCreateBodySchema)
  if (await roleExists(body.name)) {
    throw createApiError('CONFLICT', { message: `角色 ${body.name} 已存在` })
  }
  const created = await createRole({ name: body.name, description: body.description })
  await invalidateRolesListCache()
  setResponseStatus(event, 201)
  return ok(created, '角色创建成功')
})
