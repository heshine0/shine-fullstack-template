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
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(10)
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
