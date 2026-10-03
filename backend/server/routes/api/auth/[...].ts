import { defineEventHandler, toWebRequest } from 'h3'
import { auth } from '../../../utils/auth'

/**
 * Better Auth 统一挂载点：/api/auth/**
 * 由 Better Auth 设置/读取会话 Cookie（Cookie 单通道，不使用 Bearer）。
 */
export default defineEventHandler(event => auth.handler(toWebRequest(event)))
