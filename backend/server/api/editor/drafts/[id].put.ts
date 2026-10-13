import { draftIdParamSchema, updateDraftBodySchema } from '../../../schemas/editor'
import { getDraftById, updateDraftContent } from '../../../database/repositories/editor-draft'
import { assertDraftOwnership, isDraftExpired } from '../../../utils/editor-draft'

/** 更新草稿内容（仅属主，过期返回 404）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = await parseParams(event, draftIdParamSchema)
  const body = await parseBody(event, updateDraftBodySchema)

  const draft = await getDraftById(id)
  assertDraftOwnership(draft, user.id)

  if (isDraftExpired(draft.updatedAt)) {
    throw createApiError('NOT_FOUND', { message: '草稿已过期' })
  }

  const updated = await updateDraftContent(id, body.content)
  return ok({ updatedAt: updated!.updatedAt })
})
