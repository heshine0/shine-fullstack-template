import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('缺少 DATABASE_URL，请检查 .env')
  process.exit(1)
}

const sql = postgres(url, { max: 1 })
const db = drizzle(sql)

try {
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('✓ 数据库迁移完成')
} catch (err) {
  console.error('✗ 数据库迁移失败', err)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
