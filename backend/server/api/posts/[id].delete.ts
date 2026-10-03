import { deletePost } from '../../database/repositories/posts'
import { postIdParamSchema } from '../../schemas/posts'

/** 删除文章（受保护）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, postIdParamSchema)
  const row = await deletePost(id)
  if (!row) throw createApiError('NOT_FOUND', { message: '文章不存在' })
  return ok({ id }, '已删除')
})
