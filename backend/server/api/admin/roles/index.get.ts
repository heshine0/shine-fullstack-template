import { getCachedRolesList } from '../../../utils/roles-cache'

/** 角色列表（admin，缓存优先）。 */
export default defineEventHandler(async () => ok(await getCachedRolesList()))
