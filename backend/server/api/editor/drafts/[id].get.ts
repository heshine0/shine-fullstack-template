import { draftIdParamSchema } from '../../../schemas/editor'
import { getDraftById } from '../../../database/repositories/editor-draft'
import { assertDraftOwnership, isDraftExpired } from '../../../utils/editor-draft'

/** 取草稿（仅属主，过期返回 404）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = await parseParams(event, draftIdParamSchema)

  const draft = await getDraftById(id)
  assertDraftOwnership(draft, user.id)

  if (isDraftExpired(draft.updatedAt)) {
    throw createApiError('NOT_FOUND', { message: '草稿已过期' })
  }

  return ok({
    id: draft.id,
    content: draft.content,
    updatedAt: draft.updatedAt
  })
})
