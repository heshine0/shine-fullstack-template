import { listPosts } from '../../database/repositories/posts'
import { postListQuerySchema } from '../../schemas/posts'

/** 文章分页列表（受保护）。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, postListQuerySchema)
  const { rows, total } = await listPosts({
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
    keyword: query.keyword
  })
  return paginated(rows, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
