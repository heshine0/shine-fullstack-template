import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { phoneNumber } from 'better-auth/plugins'
import { db } from '../database/client'
import * as schema from '../database/schema'
import { ensureUserRoleByName, getRoleNamesByUserId } from '../database/repositories/roles'
import { getEnv, getTrustedOrigins } from './env'
import { logger } from './logger'

const env = getEnv()

/** 角色 name 常量：授权判据统一用 name，不使用独立 key 字段。 */
export const ADMIN_ROLE = 'admin'
export const DEFAULT_USER_ROLE = 'user'

/**
 * Better Auth 实例（Cookie 单通道）。
 * - 邮箱密码（minPasswordLength=8）
 * - phoneNumber 插件：OTP 存入自带 verification 表；当前环境未接入短信，sendOTP 仅打印
 * - 自助注册成功后默认挂 user 角色；管理员建用户走仓储直接入库（不触发此 hook）
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification
    }
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // 管理员创建的用户邮箱视为已验证
    requireEmailVerification: false
  },
  user: {
    additionalFields: {
      banned: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false
      }
    }
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        // TODO: 接入真实短信服务商；当前初始化阶段仅输出到日志
        logger.info(`[OTP] 向 ${phoneNumber} 发送验证码：${code}（未接入短信服务商）`)
      }
    })
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          if (!createdUser?.id) return
          try {
            await ensureUserRoleByName(createdUser.id, DEFAULT_USER_ROLE)
          } catch (err) {
            logger.error('为新注册用户分配默认角色失败', { userId: createdUser.id, err: String(err) })
          }
        }
      }
    }
  }
})

/** 读取用户角色 name 列表。 */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  return getRoleNamesByUserId(userId)
}
