import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { getEnv } from '../utils/env'
import { logger } from '../utils/logger'
import * as schema from './schema'

const env = getEnv()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * postgres.js 客户端：建立是惰性的（首个查询才真正连库），
 * 因此构造不会失败；就绪探测与重试用 pingDb 完成。
 */
export const sql: postgres.Sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {}
})

export const db = drizzle(sql, { schema })

/**
 * 就绪探测：SELECT 1，指数退避最多重试 maxAttempts 次。
 * 供启动插件与种子脚本使用。
 */
export async function pingDb(maxAttempts = 5): Promise<void> {
  let attempt = 1

  while (true) {
    try {
      await sql`select 1`
      if (attempt > 1) logger.success(`数据库连接已恢复（第 ${attempt} 次尝试）`)
      return
    } catch (err) {
      if (attempt >= maxAttempts) {
        logger.error('数据库连接多次重试后仍失败')
        throw err
      }
      const delay = 100 * 2 ** (attempt - 1)
      logger.warn(`数据库连接失败，${delay}ms 后重试（${attempt}/${maxAttempts}）`)
      await sleep(delay)
      attempt++
    }
  }
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 })
}

export type Db = typeof db
