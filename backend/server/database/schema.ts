import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import type { MediaMetadata } from '../utils/media'

/**
 * 业务表 + Better Auth 表统一出口。
 * 时间字段统一 timestamp with time zone。
 */

// 轻量角色模型：name 为稳定英文码（admin/user），description 存中文友好名
export const role = pgTable('role', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// 用户-角色 多对多关联
export const userRole = pgTable(
  'user_role',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' })
  },
  t => [primaryKey({ columns: [t.userId, t.roleId] })]
)

/**
 * 通用媒体表：COS 直传对象登记。
 * 只有固定列 id/url/type/ref_count/metadata/created_at，其余属性放 metadata jsonb。
 */
export const mediaFile = pgTable('media_file', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  url: text('url').notNull().unique(),
  type: text('type').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  metadata: jsonb('metadata').$type<MediaMetadata>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// Better Auth 四张表
export { account, session, user, verification } from './auth-schema'
