import { createSetting, settingExists } from '../../../database/repositories/settings'
import { settingCreateBodySchema } from '../../../schemas/settings'

/** 新建设置（admin）：key 冲突返回 409。 */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, settingCreateBodySchema)
  if (await settingExists(body.key)) {
    throw createApiError('CONFLICT', { message: `设置 ${body.key} 已存在` })
  }
  const created = await createSetting(body.key, body.value)
  setResponseStatus(event, 201)
  return ok(created, '设置创建成功')
})
