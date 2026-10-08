import { getSettingByKey, updateSettingValue } from '../../../database/repositories/settings'
import { settingKeyParamSchema, settingUpdateBodySchema } from '../../../schemas/settings'
import { invalidateSettingsCache } from '../../../utils/settings-cache'

/** 更新设置值（admin）：key 不可变更，仅更新 value；成功后失效缓存。 */
export default defineEventHandler(async (event) => {
  const { key } = parseParams(event, settingKeyParamSchema)
  const body = await parseBody(event, settingUpdateBodySchema)

  const target = await getSettingByKey(key)
  if (!target) throw createApiError('NOT_FOUND', { message: '设置不存在' })

  const updated = await updateSettingValue(key, body.value)
  await invalidateSettingsCache()
  return ok(updated)
})
