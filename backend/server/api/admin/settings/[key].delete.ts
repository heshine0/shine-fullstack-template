import { deleteSetting, getSettingByKey } from '../../../database/repositories/settings'
import { settingKeyParamSchema } from '../../../schemas/settings'

/** 删除设置（admin）。 */
export default defineEventHandler(async (event) => {
  const { key } = parseParams(event, settingKeyParamSchema)
  const target = await getSettingByKey(key)
  if (!target) throw createApiError('NOT_FOUND', { message: '设置不存在' })
  await deleteSetting(key)
  return ok({ key }, '设置已删除')
})
