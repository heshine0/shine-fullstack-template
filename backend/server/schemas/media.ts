import { z } from 'zod'
import { keywordQuerySchema, pageQuerySchema } from '../utils/pagination'

const mediaTypeSchema = z.enum(['image', 'video', 'audio', 'file'])

/** POST /api/media/credentials 请求体。 */
export const credentialBodySchema = z
  .object({
    type: mediaTypeSchema,
    contentType: z.string().trim().min(1).max(100),
    size: z.number().int().positive().max(500 * 1024 * 1024).optional(),
    filename: z.string().trim().min(1).max(200).optional()
  })
  .strict()

/** 客户端可上报的展示属性（不可信，仅放 metadata）。 */
const clientMediaMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    width: z.number().positive().max(100_000).optional(),
    height: z.number().positive().max(100_000).optional(),
    duration: z.number().positive().max(86_400).optional()
  })
  .strict()

/** POST /api/media/register 请求体。 */
export const registerBodySchema = z
  .object({
    key: z.string().trim().min(1).max(300),
    metadata: clientMediaMetadataSchema.optional()
  })
  .strict()

/** GET /api/admin/media 查询参数。 */
export const mediaListQuerySchema = pageQuerySchema
  .merge(keywordQuerySchema)
  .merge(z.object({ type: mediaTypeSchema.optional() }))

/** /:id 路由参数。 */
export const mediaIdParamSchema = z.object({
  id: z.string().uuid()
})
