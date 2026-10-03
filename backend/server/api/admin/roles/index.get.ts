import { listRoles } from '../../../database/repositories/roles'

/** 角色列表（admin）。 */
export default defineEventHandler(async () => ok(await listRoles()))
