import 'dotenv/config'
import { hashPassword } from 'better-auth/crypto'
import { getEnv } from '../utils/env'
import { logger } from '../utils/logger'
import { closeDb, pingDb } from './client'
import {
  getRoleByName,
  createRole,
  updateRole,
  ensureUserRoleByName
} from './repositories/roles'
import {
  getUserByEmail,
  insertUser,
  insertCredentialAccount,
  setUserBanned
} from './repositories/users'

/**
 * 种子数据：
 * - 角色 admin（管理员）、user（普通用户）
 * - 初始管理员（ADMIN_EMAIL / ADMIN_PASSWORD），授予 admin 角色
 * 幂等：可重复执行。
 */
const ROLES = [
  { name: 'admin', description: '管理员' },
  { name: 'user', description: '普通用户' }
] as const

async function ensureRole(name: string, description: string) {
  const existing = await getRoleByName(name)
  if (existing) {
    if (existing.description !== description) {
      await updateRole(existing.id, { description })
      logger.info(`已更新角色描述：${name}`)
    }
    return existing
  }
  const created = await createRole({ name, description })
  logger.success(`已创建角色：${name}（${description}）`)
  return created
}

async function main() {
  const env = getEnv()
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('缺少 ADMIN_EMAIL / ADMIN_PASSWORD，请检查 .env（密码至少 8 位）')
  }

  await pingDb()

  for (const r of ROLES) {
    await ensureRole(r.name, r.description)
  }

  const email = env.ADMIN_EMAIL.trim().toLowerCase()
  let adminUser = await getUserByEmail(email)
  if (!adminUser) {
    const userId = crypto.randomUUID()
    adminUser = await insertUser({
      id: userId,
      name: '超级管理员',
      email,
      emailVerified: true,
      banned: false
    })
    const passwordHash = await hashPassword(env.ADMIN_PASSWORD)
    await insertCredentialAccount({ userId, passwordHash })
    logger.success(`已创建初始管理员：${email}`)
  } else {
    logger.info(`管理员 ${email} 已存在，跳过创建`)
  }

  if (adminUser.banned) {
    await setUserBanned(adminUser.id, false)
    logger.info('已解除初始管理员的停用状态')
  }

  await ensureUserRoleByName(adminUser.id, 'admin')
  logger.success('✓ 种子完成')
}

main()
  .catch((err) => {
    logger.error('✗ 种子执行失败', err)
    process.exitCode = 1
  })
  .finally(() => closeDb())
