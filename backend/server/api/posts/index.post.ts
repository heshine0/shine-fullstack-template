import { createPost } from '../../database/repositories/posts'
import { postCreateBodySchema } from '../../schemas/posts'

/** 创建文章（受保护）。 */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, postCreateBodySchema)
  const created = await createPost({
    title: body.title,
    content: body.content,
    published: body.published
  })
  setResponseStatus(event, 201)
  return ok(created)
})
