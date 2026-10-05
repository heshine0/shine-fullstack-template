import { listMedia } from '../../../database/repositories/media'
import { mediaListQuerySchema } from '../../../schemas/media'

/** 媒体分页列表（admin，支持类型筛选与 URL/文件名关键词搜索）。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, mediaListQuerySchema)
  const { rows, total } = await listMedia({
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
    type: query.type,
    keyword: query.keyword
  })
  return paginated(
    rows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
})
