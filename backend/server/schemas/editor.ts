import { z } from 'zod'
import { DRAFT_CONTENT_MAX } from '../utils/editor-draft'

/** POST /api/editor/drafts 请求体。 */
export const createDraftBodySchema = z
  .object({
    content: z.string().max(DRAFT_CONTENT_MAX).default('')
  })
  .strict()

/** PUT /api/editor/drafts/:id 请求体。 */
export const updateDraftBodySchema = z
  .object({
    content: z.string().max(DRAFT_CONTENT_MAX)
  })
  .strict()

/** /:id 路由参数。 */
export const draftIdParamSchema = z.object({
  id: z.string().uuid()
})
