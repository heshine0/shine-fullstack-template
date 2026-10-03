import { updatePost } from '../../database/repositories/posts'
import { postIdParamSchema, postUpdateBodySchema } from '../../schemas/posts'

/** 更新文章（受保护）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, postIdParamSchema)
  const body = await parseBody(event, postUpdateBodySchema)
  const row = await updatePost(id, body)
  if (!row) throw createApiError('NOT_FOUND', { message: '文章不存在' })
  return ok(row)
})
