import { draftIdParamSchema } from '../../../schemas/editor'
import { getDraftById, deleteDraftById } from '../../../database/repositories/editor-draft'
import { assertDraftOwnership } from '../../../utils/editor-draft'

/** 删除草稿（仅属主）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = await parseParams(event, draftIdParamSchema)

  const draft = await getDraftById(id)
  assertDraftOwnership(draft, user.id)

  await deleteDraftById(id)
  return ok({ id })
})
