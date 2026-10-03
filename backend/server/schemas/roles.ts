import { z } from 'zod'

export const roleIdParamSchema = z.object({
  id: z.string().min(1).max(64)
})

// role.name 作为稳定英文码用于授权判据
export const roleCreateBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,49}$/i, '只能包含字母、数字、下划线、连字符，且以字母开头'),
    description: z.string().trim().max(100).default('')
  })
  .strict()

export const roleUpdateBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,49}$/i, '只能包含字母、数字、下划线、连字符，且以字母开头')
      .optional(),
    description: z.string().trim().max(100).optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: '至少提供一个待更新字段' })
