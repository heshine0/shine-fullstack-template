import { z } from 'zod'
import { keywordQuerySchema, pageQuerySchema } from '../utils/pagination'

export const userListQuerySchema = pageQuerySchema.merge(keywordQuerySchema)

// 自助注册用户 id 由 better-auth 生成（非 uuid），管理员建用户用 uuid，故从宽校验
export const userIdParamSchema = z.object({
  id: z.string().min(1).max(64)
})

export const userCreateBodySchema = z
  .object({
    email: z.string().trim().email().max(120),
    password: z.string().min(8).max(100),
    name: z.string().trim().min(1).max(50),
    phoneNumber: z.string().trim().min(5).max(20).optional(),
    roles: z.array(z.string().trim().min(1).max(50)).max(20).optional()
  })
  .strict()

export const userUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    phoneNumber: z.string().trim().min(5).max(20).nullable().optional(),
    banned: z.boolean().optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: '至少提供一个待更新字段' })

export const userRolesBodySchema = z
  .object({
    roles: z.array(z.string().trim().min(1).max(50)).max(20)
  })
  .strict()
