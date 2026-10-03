import { getPostById } from '../../database/repositories/posts'
import { postIdParamSchema } from '../../schemas/posts'

/** 文章详情（受保护）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, postIdParamSchema)
  const row = await getPostById(id)
  if (!row) throw createApiError('NOT_FOUND', { message: '文章不存在' })
  return ok(row)
})
