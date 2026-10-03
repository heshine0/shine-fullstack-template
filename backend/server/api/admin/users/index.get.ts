import { getRoleNamesMapByUserIds } from '../../../database/repositories/roles'
import { listUsers } from '../../../database/repositories/users'
import { userListQuerySchema } from '../../../schemas/users'

/** 用户分页列表（admin）。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, userListQuerySchema)
  const { rows, total } = await listUsers({
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
    keyword: query.keyword
  })
  const roleMap = await getRoleNamesMapByUserIds(rows.map(u => u.id))
  const data = rows.map(u => ({ ...u, roles: roleMap.get(u.id) ?? [] }))
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
