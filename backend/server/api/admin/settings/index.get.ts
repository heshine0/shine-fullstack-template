import { getCachedSettingsList } from '../../../utils/settings-cache'

/** 设置列表（admin），读取走缓存。 */
export default defineEventHandler(async () => ok(await getCachedSettingsList()))
