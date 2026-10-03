import { z } from 'zod'
import { keywordQuerySchema, pageQuerySchema } from '../utils/pagination'

export const postListQuerySchema = pageQuerySchema.merge(keywordQuerySchema)

export const postIdParamSchema = z.object({
  id: z.string().uuid()
})

export const postCreateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    content: z.string().max(5000).default(''),
    published: z.boolean().default(false)
  })
  .strict()

export const postUpdateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    content: z.string().max(5000).optional(),
    published: z.boolean().optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: '至少提供一个待更新字段' })
