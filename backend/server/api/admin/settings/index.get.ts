import { listSettings } from '../../../database/repositories/settings'

/** 设置列表（admin）。 */
export default defineEventHandler(async () => ok(await listSettings()))
