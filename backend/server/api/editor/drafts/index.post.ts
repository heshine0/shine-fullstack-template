import { createDraftBodySchema } from '../../../schemas/editor'
import { createDraft, deleteExpiredDraftsByUser } from '../../../database/repositories/editor-draft'

/**
 * 创建草稿（登录用户）。
 * 创建时顺带清理本人过期草稿（惰性清理）。
 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = await parseBody(event, createDraftBodySchema)

  // 惰性清理：创建新草稿时删除本人过期草稿
  await deleteExpiredDraftsByUser(user.id)

  const draft = await createDraft({
    id: crypto.randomUUID(),
    userId: user.id,
    content: body.content
  })

  return ok({
    id: draft.id,
    content: draft.content,
    updatedAt: draft.updatedAt
  })
})
