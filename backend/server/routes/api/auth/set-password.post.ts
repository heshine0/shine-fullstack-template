import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { auth } from '../../../utils/auth'
import { hasCredentialPassword } from '../../../database/repositories/users'

/**
 * 首次设置登录密码（手机号/微信等无密码用户）。
 *
 * Better Auth 原生 setPassword 端点声明为 serverOnly，永不挂载到 HTTP 路由，
 * 因此在此以精确路径覆盖 catch-all，内部调起 auth.api.setPassword。
 *
 * 前置校验：当前用户必须尚未设置密码（已设过则 Better Auth 会回 PASSWORD_ALREADY_SET）。
 * 返回裸数据 `{ status: true }`，与 Better Auth 原生端点格式一致。
 */
const bodySchema = z.object({
  newPassword: z.string().min(8).max(100)
})

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  if (await hasCredentialPassword(user.id)) {
    throw createApiError('CONFLICT', { message: '账号已设置过密码，请使用修改密码功能' })
  }
  const body = await parseBody(event, bodySchema)
  const result = await auth.api.setPassword({
    body: { newPassword: body.newPassword },
    headers: event.headers
  })
  return result
})
