import { z } from 'zod'

/**
 * 环境变量校验（fail-fast）。
 *
 * Nuxt 在 dev/build 时会自动把 backend/.env 载入 process.env；
 * 独立脚本（drizzle.config.ts、seed.ts）需自行 `import 'dotenv/config'`。
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL 必须是合法的连接串'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL 必须是合法的 URL'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET 至少 32 个字符'),
  TRUSTED_ORIGINS: z.string().default('http://localhost:3000'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(10),
  // 微信小程序「获取手机号」：非 mock 模式下调用微信 API 时必须提供
  WECHAT_APPID: z.string().optional(),
  WECHAT_SECRET: z.string().optional(),
  // 开发联调用：仅字符串 'true' 视为开启（不能用 z.coerce.boolean——它会把 'false' 也转成 true）
  WECHAT_MOCK: z.string().default('false').transform(v => v === 'true'),
  // 腾讯云 COS（不配置不影响应用启动，仅调用媒体接口时报“对象存储未配置”）
  TENCENT_COS_SECRET_ID: z.string().optional(),
  TENCENT_COS_SECRET_KEY: z.string().optional(),
  TENCENT_COS_BUCKET: z.string().optional(),
  TENCENT_COS_REGION: z.string().default('ap-shanghai'),
  // CDN/自定义访问域名（不含结尾斜杠）；为空时使用 COS 默认域名
  TENCENT_COS_DOMAIN: z.string().optional(),
  TENCENT_COS_STS_TTL: z.coerce.number().int().positive().max(7200).default(1800),
  // 缓存：存储介质 memory（进程内，默认）| redis（共享缓存，需 CACHE_REDIS_URL）
  CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  CACHE_REDIS_URL: z.string().optional(),
  // 默认过期时间（秒）与 key 前缀（多应用共用同一 Redis 时隔离）
  CACHE_TTL: z.coerce.number().int().positive().default(300),
  CACHE_KEY_PREFIX: z.string().default('app')
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

/** 读取并缓存校验通过的环境变量；校验失败立即抛错（fail-fast）。 */
export function getEnv(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`环境变量校验失败，请检查 .env：\n${issues}`)
  }
  cached = parsed.data
  return cached
}

/** 允许携带凭证跨域访问后端的来源列表。 */
export function getTrustedOrigins(): string[] {
  return getEnv()
    .TRUSTED_ORIGINS.split(',')
    .map(s => s.trim())
    .filter(Boolean)
}
