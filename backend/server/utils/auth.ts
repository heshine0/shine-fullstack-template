import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { oneTimeToken, phoneNumber } from 'better-auth/plugins'
import { db } from '../database/client'
import * as schema from '../database/schema'
import { ensureUserRoleByName, getRoleNamesByUserId } from '../database/repositories/roles'
import { getEnv, getTrustedOrigins } from './env'
import { logger } from './logger'
import { isValidPhoneNumber, logSmsSender } from './sms'
import { wechatPhone } from './auth-wechat'

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
      // 6 位数字验证码，5 分钟有效，错误最多尝试 3 次（插件默认）
      otpLength: 6,
      expiresIn: 300,
      phoneNumberValidator: isValidPhoneNumber,
      // 开发期验证码仅写日志；接服务商时替换 logSmsSender 即可
      sendOTP: logSmsSender,
      // 验证码校验通过但用户不存在：自动建号（手机号即已验证），
      // 由下方 databaseHooks.user.create.after 自动挂默认 user 角色
      signUpOnVerification: {
        // 客户端上送带国家号（如 '+8613800138000'），邮箱本地部分只保留数字
        getTempEmail: (phone: string) => `${phone.replace(/\D/g, '')}@phone.local`
      }
    }),
    // 微信小程序「获取手机号」一键登录（/api/auth/wechat/phone-sign-in）
    wechatPhone(),
    // 小程序 web-view 免登录访问管理后台的一次性票据：
    // GET  /api/auth/one-time-token/generate（需已登录会话）→ { token }
    // POST /api/auth/one-time-token/verify（公开）→ 原子消费票据并 Set-Cookie
    // - 有效期 60s（expiresIn 单位为分钟，最小 1），票据仅一次性使用（consume 即删除）
    // - storeToken:'hashed'：verification 表只存 token 的 SHA-256，明文仅返回一次
    // - 注意：兑换后 web-view 与小程序【共享同一条 session】（插件存的是当前 session token），
    //   任一端 sign-out 会同时让另一端失效；无新建独立会话
    oneTimeToken({
      expiresIn: 1,
      storeToken: 'hashed'
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
