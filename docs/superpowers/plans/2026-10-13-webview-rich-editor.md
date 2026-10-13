# WebView 富文本编辑器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端 Nuxt UI UEditor 承载编辑 + 前端 web-view 宿主 + mp-html 只读渲染 + 草稿表中转，实现跨端富文本编辑。

**Architecture:** 后端新增 editor_draft 表与 CRUD API + Nuxt UI UEditor 编辑器页（ClientOnly，Tiptap 扩展 + COS 直传）；前端新增宿主页（H5 iframe / 微信 web-view 条件编译）+ useRichEditor composable + 从旧分支移植 rich-viewer 只读渲染组件 + 演示页。

**Tech Stack:** Nuxt 4 + @nuxt/ui@4.11 (Tiptap 3.31.4) + Drizzle ORM + PostgreSQL | unibest + Vue3 + alova + mp-html

---

## 文件结构

### 后端新建/修改

| 文件 | 职责 |
|------|------|
| `backend/server/database/schema.ts` (修改) | 新增 editorDraft 表定义 |
| `backend/drizzle/0001_editor_draft.sql` (生成) | 迁移 SQL |
| `backend/server/utils/editor-draft.ts` (新建) | TTL 判定、属主过滤、过期清理纯函数 |
| `backend/server/utils/editor-draft.test.ts` (新建) | 上述纯函数单测 |
| `backend/server/schemas/editor.ts` (新建) | Zod schema（draft body / id param） |
| `backend/server/database/repositories/editor-draft.ts` (新建) | editor_draft CRUD repository |
| `backend/server/api/editor/drafts/index.post.ts` (新建) | POST 创建草稿 |
| `backend/server/api/editor/drafts/[id].get.ts` (新建) | GET 取草稿 |
| `backend/server/api/editor/drafts/[id].put.ts` (新建) | PUT 更新草稿 |
| `backend/server/api/editor/drafts/[id].delete.ts` (新建) | DELETE 删草稿 |
| `backend/app/utils/editor-media.ts` (新建) | 浏览器直传 COS（凭证申请 + PostObject + 登记） |
| `backend/app/composables/useEditorBridge.ts` (新建) | H5 postMessage / 微信 wx.miniProgram 桥接 |
| `backend/app/pages/rich-editor.vue` (新建) | UEditor 编辑器页（layout:false） |

### 前端新建/修改

| 文件 | 职责 |
|------|------|
| `frontend/src/api/editor.ts` (新建) | drafts 四接口（alova） |
| `frontend/src/composables/useRichEditor.ts` (新建) | openRichEditor + 桥消息归约函数 |
| `frontend/src/composables/useRichEditor.test.ts` (新建) | 归约函数单测 |
| `frontend/src/pages/webview/editor/index.vue` (新建) | 宿主页（H5 iframe / 微信 web-view） |
| `frontend/src/components/rich-viewer/rich-viewer.vue` (新建) | mp-html 只读渲染 |
| `frontend/src/components/rich-viewer/rich-link.ts` (新建) | normalizeLinkUrl 纯函数 |
| `frontend/src/components/rich-viewer/rich-link.test.ts` (新建) | 上述纯函数单测 |
| `frontend/scripts/vendor-mp-html.mjs` (新建) | mp-html 定制构建脚本（仅 audio 插件） |
| `frontend/src/components/mp-html/` (生成) | vendor 脚本生成的组件产物 |
| `frontend/tsconfig.json` (修改) | exclude 添加 mp-html 目录 |
| `frontend/eslint.config.mjs` (修改) | ignores 添加 mp-html 目录 |
| `frontend/src/pages/richtext/demo.vue` (新建) | 演示页 |

---

## Task 1: editor_draft 表 schema 与迁移

**Files:**
- Modify: `backend/server/database/schema.ts`
- Generate: `backend/drizzle/0001_editor_draft.sql`

- [ ] **Step 1: 在 schema.ts 末尾添加 editorDraft 表**

在 `backend/server/database/schema.ts` 中 `export { account, session, user, verification }` 之前插入：

```ts
/**
 * 富文本编辑器草稿表。
 * TTL 7 天惰性清理（GET/PUT 命中过期草稿返回 404）。
 * content 上限 100 万字符（Zod 校验）。
 */
export const editorDraft = pgTable('editor_draft', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  content: text('content').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
```

- [ ] **Step 2: 生成迁移文件**

Run:
```bash
cd backend && bunx drizzle-kit generate --name=editor-draft
```

Expected: 生成 `backend/drizzle/0001_editor_draft.sql`，包含 `CREATE TABLE "editor_draft" (...)`

- [ ] **Step 3: 执行迁移**

Run:
```bash
cd backend && bun run db:migrate
```

Expected: 无报错，表已创建。可验证：`psql -h 127.0.0.1 -U postgres -d tongxiangwuxie -c "\d editor_draft"`

- [ ] **Step 4: typecheck**

Run: `cd backend && bun run typecheck`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add backend/server/database/schema.ts backend/drizzle/
git commit -m "feat: add editor_draft table schema and migration"
```

---

## Task 2: editor-draft 纯逻辑 + 单测

**Files:**
- Create: `backend/server/utils/editor-draft.ts`
- Test: `backend/server/utils/editor-draft.test.ts`

- [ ] **Step 1: 写失败测试**

Create `backend/server/utils/editor-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isDraftExpired, assertDraftOwnership, buildExpiryCutoff, DRAFT_TTL_MS } from './editor-draft'

describe('editor-draft', () => {
  const NOW = new Date('2026-10-13T12:00:00Z').getTime()

  it('isDraftExpired: 7 天内未过期', () => {
    expect(isDraftExpired(new Date('2026-10-13T11:00:00Z'), NOW)).toBe(false)
    expect(isDraftExpired(new Date('2026-10-06T12:00:01Z'), NOW)).toBe(false)
  })

  it('isDraftExpired: 超过 7 天判定过期', () => {
    expect(isDraftExpired(new Date('2026-10-06T11:59:59Z'), NOW)).toBe(true)
    expect(isDraftExpired(new Date('2026-10-01T00:00:00Z'), NOW)).toBe(true)
  })

  it('assertDraftOwnership: null 草稿抛错', () => {
    expect(() => assertDraftOwnership(null, 'user1')).toThrow()
  })

  it('assertDraftOwnership: 非属主抛错', () => {
    expect(() => assertDraftOwnership({ userId: 'user1' }, 'user2')).toThrow()
  })

  it('assertDraftOwnership: 属主通过', () => {
    expect(() => assertDraftOwnership({ userId: 'user1' }, 'user1')).not.toThrow()
  })

  it('buildExpiryCutoff: 返回 7 天前的时间', () => {
    const cutoff = buildExpiryCutoff(NOW)
    expect(cutoff.getTime()).toBe(NOW - DRAFT_TTL_MS)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && bun run test -- editor-draft`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 写实现**

Create `backend/server/utils/editor-draft.ts`:

```ts
import { createApiError } from './errors'

/** 草稿 TTL：7 天（毫秒）。 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 草稿内容上限（字符数）。 */
export const DRAFT_CONTENT_MAX = 1_000_000

/** 判定草稿是否过期（基于 updatedAt）。 */
export function isDraftExpired(updatedAt: Date, now: number = Date.now()): boolean {
  return now - updatedAt.getTime() > DRAFT_TTL_MS
}

/**
 * 校验草稿属主：null 或非属主均抛 NOT_FOUND（不泄漏存在性）。
 */
export function assertDraftOwnership(
  draft: { userId: string } | null,
  userId: string
): asserts draft is { userId: string } {
  if (!draft) throw createApiError('NOT_FOUND')
  if (draft.userId !== userId) throw createApiError('NOT_FOUND')
}

/** 构建 7 天前的截止时间点，用于批量清理过期草稿的 WHERE 条件。 */
export function buildExpiryCutoff(now: number = Date.now()): Date {
  return new Date(now - DRAFT_TTL_MS)
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && bun run test -- editor-draft`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/server/utils/editor-draft.ts backend/server/utils/editor-draft.test.ts
git commit -m "feat: add editor-draft pure logic with tests"
```

---

## Task 3: Zod schema + repository

**Files:**
- Create: `backend/server/schemas/editor.ts`
- Create: `backend/server/database/repositories/editor-draft.ts`

- [ ] **Step 1: 写 Zod schema**

Create `backend/server/schemas/editor.ts`:

```ts
import { z } from 'zod'
import { DRAFT_CONTENT_MAX } from '../utils/editor-draft'

/** POST /api/editor/drafts 请求体。 */
export const createDraftBodySchema = z
  .object({
    content: z.string().max(DRAFT_CONTENT_MAX).default('')
  })
  .strict()

/** PUT /api/editor/drafts/:id 请求体。 */
export const updateDraftBodySchema = z
  .object({
    content: z.string().max(DRAFT_CONTENT_MAX)
  })
  .strict()

/** /:id 路由参数。 */
export const draftIdParamSchema = z.object({
  id: z.string().uuid()
})
```

- [ ] **Step 2: 写 repository**

Create `backend/server/database/repositories/editor-draft.ts`:

```ts
import { and, eq, lt } from 'drizzle-orm'
import { db } from '../client'
import { editorDraft, type editorDraft } from '../schema'
import { buildExpiryCutoff } from '../../utils/editor-draft'

export type EditorDraftRow = typeof editorDraft.$inferSelect

export async function createDraft(data: {
  id: string
  userId: string
  content: string
}): Promise<EditorDraftRow> {
  const rows = await db.insert(editorDraft).values(data).returning()
  return rows[0]!
}

export async function getDraftById(id: string): Promise<EditorDraftRow | null> {
  const rows = await db.select().from(editorDraft).where(eq(editorDraft.id, id)).limit(1)
  return rows[0] ?? null
}

export async function updateDraftContent(
  id: string,
  content: string
): Promise<EditorDraftRow | null> {
  const rows = await db
    .update(editorDraft)
    .set({ content, updatedAt: new Date() })
    .where(eq(editorDraft.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteDraftById(id: string): Promise<EditorDraftRow | null> {
  const rows = await db.delete(editorDraft).where(eq(editorDraft.id, id)).returning()
  return rows[0] ?? null
}

/** 删除指定用户的过期草稿（惰性清理，POST 创建时顺带调用）。 */
export async function deleteExpiredDraftsByUser(userId: string): Promise<void> {
  const cutoff = buildExpiryCutoff()
  await db.delete(editorDraft).where(
    and(eq(editorDraft.userId, userId), lt(editorDraft.updatedAt, cutoff))
  )
}
```

- [ ] **Step 3: typecheck**

Run: `cd backend && bun run typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add backend/server/schemas/editor.ts backend/server/database/repositories/editor-draft.ts
git commit -m "feat: add editor draft zod schema and repository"
```

---

## Task 4: 草稿 API（4 个端点）

**Files:**
- Create: `backend/server/api/editor/drafts/index.post.ts`
- Create: `backend/server/api/editor/drafts/[id].get.ts`
- Create: `backend/server/api/editor/drafts/[id].put.ts`
- Create: `backend/server/api/editor/drafts/[id].delete.ts`

> **注意：** `requireUser`、`parseBody`、`parseParams`、`createApiError`、`ok`、`logError` 均为 Nuxt auto-import，无需显式 import。仅 schema 与 repository 需显式 import。

- [ ] **Step 1: POST /api/editor/drafts**

Create `backend/server/api/editor/drafts/index.post.ts`:

```ts
import { createDraftBodySchema } from '../../../schemas/editor'
import { createDraft, deleteExpiredDraftsByUser } from '../../../database/repositories/editor-draft'

/**
 * 创建草稿（登录用户）。
 * 创建时顺带清理本人过期草稿（惰性清理）。
 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = await parseBody(event, createDraftBodySchema)

  // 惰性清理：创建新草稿时删除本人过期草稿
  await deleteExpiredDraftsByUser(user.id)

  const draft = await createDraft({
    id: crypto.randomUUID(),
    userId: user.id,
    content: body.content
  })

  return ok({
    id: draft.id,
    content: draft.content,
    updatedAt: draft.updatedAt
  })
})
```

- [ ] **Step 2: GET /api/editor/drafts/:id**

Create `backend/server/api/editor/drafts/[id].get.ts`:

```ts
import { draftIdParamSchema } from '../../../schemas/editor'
import { getDraftById } from '../../../database/repositories/editor-draft'
import { assertDraftOwnership, isDraftExpired } from '../../../utils/editor-draft'

/** 取草稿（仅属主，过期返回 404）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = await parseParams(event, draftIdParamSchema)

  const draft = await getDraftById(id)
  assertDraftOwnership(draft, user.id)

  if (isDraftExpired(draft.updatedAt)) {
    throw createApiError('NOT_FOUND', { message: '草稿已过期' })
  }

  return ok({
    id: draft.id,
    content: draft.content,
    updatedAt: draft.updatedAt
  })
})
```

- [ ] **Step 3: PUT /api/editor/drafts/:id**

Create `backend/server/api/editor/drafts/[id].put.ts`:

```ts
import { draftIdParamSchema, updateDraftBodySchema } from '../../../schemas/editor'
import { getDraftById, updateDraftContent } from '../../../database/repositories/editor-draft'
import { assertDraftOwnership, isDraftExpired } from '../../../utils/editor-draft'

/** 更新草稿内容（仅属主，过期返回 404）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = await parseParams(event, draftIdParamSchema)
  const body = await parseBody(event, updateDraftBodySchema)

  const draft = await getDraftById(id)
  assertDraftOwnership(draft, user.id)

  if (isDraftExpired(draft.updatedAt)) {
    throw createApiError('NOT_FOUND', { message: '草稿已过期' })
  }

  const updated = await updateDraftContent(id, body.content)
  return ok({ updatedAt: updated!.updatedAt })
})
```

- [ ] **Step 4: DELETE /api/editor/drafts/:id**

Create `backend/server/api/editor/drafts/[id].delete.ts`:

```ts
import { draftIdParamSchema } from '../../../schemas/editor'
import { getDraftById, deleteDraftById } from '../../../database/repositories/editor-draft'
import { assertDraftOwnership } from '../../../utils/editor-draft'

/** 删除草稿（仅属主）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = await parseParams(event, draftIdParamSchema)

  const draft = await getDraftById(id)
  assertDraftOwnership(draft, user.id)

  await deleteDraftById(id)
  return ok({ id })
})
```

- [ ] **Step 5: lint + typecheck**

Run: `cd backend && bun run lint && bun run typecheck`
Expected: 无错误

- [ ] **Step 6: 运行已有测试确认无回归**

Run: `cd backend && bun run test`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/server/api/editor/
git commit -m "feat: add editor draft CRUD API endpoints"
```

---

## Task 5: 安装后端依赖

**Files:**
- Modify: `backend/package.json`

> @nuxt/ui@4.11 内置 Tiptap 3.31.4，需安装对齐版本的扩展包。`crypto-js` 用于编辑器页浏览器端 COS PostObject 签名（与前端 cos-post.ts 同算法）。

- [ ] **Step 1: 安装 tiptap 扩展与 crypto-js**

Run:
```bash
cd backend && bun add @tiptap/extension-text-align@3.31.4 @tiptap/extension-text-style@3.31.4 @tiptap/extension-color@3.31.4 @tiptap/extension-highlight@3.31.4 @tiptap/extension-font-family@3.31.4 crypto-js && bun add -d @types/crypto-js
```

Expected: package.json dependencies 中出现上述包，版本 3.31.4

- [ ] **Step 2: Commit**

```bash
git add backend/package.json backend/bun.lock
git commit -m "chore: add tiptap extensions and crypto-js for rich editor"
```

---

## Task 6: 编辑器媒体工具

**Files:**
- Create: `backend/app/utils/editor-media.ts`

> 此文件在浏览器端运行（编辑器页 ClientOnly 内）。使用 `$fetch` 调用同站 API，`fetch + FormData` 直传 COS，`crypto-js` 做 HMAC-SHA1 签名（与 frontend/src/utils/cos-post.ts 同算法）。

- [ ] **Step 1: 写实现**

Create `backend/app/utils/editor-media.ts`:

```ts
import CryptoJS from 'crypto-js'

type MediaType = 'image' | 'video' | 'audio'

interface ScopedCredential {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  startTime: number
  expiredTime: number
}

interface CredentialResponse {
  credential: ScopedCredential
  bucket: string
  region: string
  key: string
  url: string
}

interface MediaMetadata {
  name?: string
  width?: number
  height?: number
  duration?: number
}

export interface UploadResult {
  url: string
  metadata: MediaMetadata
}

const MEDIA_LIMITS: Record<MediaType, number> = {
  image: 10 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio: 50 * 1024 * 1024
}

async function getMediaCredential(type: MediaType, file: File): Promise<CredentialResponse> {
  return await $fetch<CredentialResponse>('/api/media/credentials', {
    method: 'POST',
    body: { type, contentType: file.type, size: file.size, filename: file.name },
    credentials: 'include'
  })
}

function buildPostFormFields(
  credential: ScopedCredential,
  bucket: string,
  key: string,
  contentType?: string
): Record<string, string> {
  const keyTime = `${credential.startTime};${credential.expiredTime}`
  const policy = {
    expiration: new Date(credential.expiredTime * 1000).toISOString(),
    conditions: [
      { 'q-sign-algorithm': 'sha1' },
      { 'q-ak': credential.tmpSecretId },
      { 'q-sign-time': keyTime },
      { 'q-key-time': keyTime },
      { 'q-header-list': '' },
      { 'q-url-param-list': '' },
      { bucket },
      ['starts-with', '$key', key]
    ]
  }
  const policyB64 = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(JSON.stringify(policy))
  )
  const signKey = CryptoJS.HmacSHA1(keyTime, credential.tmpSecretKey).toString()
  const signature = CryptoJS.HmacSHA1(policyB64, signKey).toString()
  return {
    key,
    policy: policyB64,
    'q-sign-algorithm': 'sha1',
    'q-ak': credential.tmpSecretId,
    'q-key-time': keyTime,
    'q-signature': signature,
    'x-cos-security-token': credential.sessionToken,
    'success_action_status': '200',
    ...(contentType ? { 'Content-Type': contentType } : {})
  }
}

async function registerMedia(key: string, metadata: MediaMetadata): Promise<void> {
  await $fetch('/api/media/register', {
    method: 'POST',
    body: { key, metadata },
    credentials: 'include'
  })
}

function loadImageDimensions(file: File): Promise<MediaMetadata> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({})
    img.src = URL.createObjectURL(file)
  })
}

function loadVideoMetadata(file: File): Promise<MediaMetadata> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.onloadedmetadata = () =>
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
    video.onerror = () => resolve({})
    video.src = URL.createObjectURL(file)
  })
}

function loadAudioMetadata(file: File): Promise<MediaMetadata> {
  return new Promise(resolve => {
    const audio = document.createElement('audio')
    audio.onloadedmetadata = () => resolve({ duration: audio.duration })
    audio.onerror = () => resolve({})
    audio.src = URL.createObjectURL(file)
  })
}

/** 浏览器直传 COS 并登记媒体。 */
export async function uploadMediaFile(file: File, type: MediaType): Promise<UploadResult> {
  if (file.size > MEDIA_LIMITS[type]) {
    const maxMb = MEDIA_LIMITS[type] / 1024 / 1024
    throw new Error(`文件大小超过限制（最大 ${maxMb}MB）`)
  }

  const { credential, bucket, region, key, url } = await getMediaCredential(type, file)

  const formFields = buildPostFormFields(credential, bucket, key, file.type)
  const formData = new FormData()
  for (const [k, v] of Object.entries(formFields)) {
    formData.append(k, v)
  }
  formData.append('file', file)

  const uploadUrl = `https://${bucket}.cos.${region}.myqcloud.com/`
  const resp = await fetch(uploadUrl, { method: 'POST', body: formData })
  if (!resp.ok) throw new Error('上传到对象存储失败')

  const metadata: MediaMetadata = { name: file.name }
  if (type === 'image') Object.assign(metadata, await loadImageDimensions(file))
  else if (type === 'video') Object.assign(metadata, await loadVideoMetadata(file))
  else if (type === 'audio') Object.assign(metadata, await loadAudioMetadata(file))

  await registerMedia(key, metadata)
  return { url, metadata }
}
```

- [ ] **Step 2: typecheck**

Run: `cd backend && bun run typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add backend/app/utils/editor-media.ts
git commit -m "feat: add editor media upload utility for browser COS direct upload"
```

---

## Task 7: 编辑器桥接 composable

**Files:**
- Create: `backend/app/composables/useEditorBridge.ts`

> UA 识别微信 web-view 动态注入 jweixin。H5 用 `window.parent.postMessage`，微信用 `wx.miniProgram.postMessage`。消息协议统一 `{source:'txwx-rich-editor', type, ...}`。

- [ ] **Step 1: 写实现**

Create `backend/app/composables/useEditorBridge.ts`:

```ts
const SOURCE = 'txwx-rich-editor' as const

type MessageType = 'ready' | 'update' | 'done' | 'cancel' | 'error'

interface BridgeMessage {
  source: typeof SOURCE
  type: MessageType
  [key: string]: unknown
}

/** H5 宿主 origin（生产须配置为 H5 域名，开发态用 location.origin）。 */
function getH5Origin(): string {
  return import.meta.env.VITE_EDITOR_H5_ORIGIN || window.location.origin
}

/** 是否在微信 web-view 环境中。 */
function isWeChatWebView(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('miniprogram')
}

/** 动态加载微信 JS-SDK。 */
function loadWeChatSdk(): Promise<void> {
  return new Promise(resolve => {
    if ((window as any).wx?.miniProgram) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.3.2.js'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}

export function useEditorBridge() {
  const isWeChat = isWeChatWebView()

  if (isWeChat) void loadWeChatSdk()

  function postMessage(msg: Omit<BridgeMessage, 'source'>) {
    const full: BridgeMessage = { source: SOURCE, ...msg }
    if (isWeChat && (window as any).wx?.miniProgram) {
      ;(window as any).wx.miniProgram.postMessage({ data: full })
    } else {
      window.parent.postMessage(full, getH5Origin())
    }
  }

  function done(data: { draftId: string, html: string }) {
    postMessage({ type: 'done', ...data })
    if (isWeChat && (window as any).wx?.miniProgram) {
      ;(window as any).wx.miniProgram.navigateBack()
    }
  }

  function cancel() {
    postMessage({ type: 'cancel' })
    if (isWeChat && (window as any).wx?.miniProgram) {
      ;(window as any).wx.miniProgram.navigateBack()
    }
  }

  return { postMessage, done, cancel }
}
```

- [ ] **Step 2: typecheck**

Run: `cd backend && bun run typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add backend/app/composables/useEditorBridge.ts
git commit -m "feat: add editor bridge composable for H5/WeChat postMessage"
```

---

## Task 8: 编辑器页 rich-editor.vue

**Files:**
- Create: `backend/app/pages/rich-editor.vue`

> `definePageMeta({ layout: false })`，ClientOnly 包裹 UEditor。自定义 Tiptap 扩展（Video/Audio/FontSize）+ 额外扩展（TextAlign/TextStyle/Color/Highlight/FontFamily）。吸顶工具栏 + 底部操作栏。草稿加载、防抖自动保存、媒体上传、桥接通信。

- [ ] **Step 1: 写编辑器页**

Create `backend/app/pages/rich-editor.vue`:

```vue
<script setup lang="ts">
import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Color } from '@tiptap/extension-color'
import { FontFamily } from '@tiptap/extension-font-family'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { uploadMediaFile } from '~/utils/editor-media'
import { useEditorBridge } from '~/composables/useEditorBridge'

definePageMeta({ layout: false })

// ===== 自定义 Tiptap 扩展 =====

const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true }
    }
  },
  parseHTML() {
    return [{ tag: 'video' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, {
      controls: true, playsinline: true, style: 'max-width:100%'
    })]
  }
})

const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true }
    }
  },
  parseHTML() {
    return [{ tag: 'audio' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['audio', mergeAttributes(HTMLAttributes, { controls: true, style: 'width:100%' })]
  }
})

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] }
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (val: string | null) => val ? { style: `font-size: ${val}` } : {}
        }
      }
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    } as any
  }
})

// ===== 草稿管理 =====
const route = useRoute()
const draftId = computed(() => (route.query.draft as string) || '')
const html = ref('')
const editorRef = ref<any>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null

const extensions = [
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  FontFamily,
  FontSize,
  Video,
  Audio
]

const bridge = useEditorBridge()
const toast = useToast()

onMounted(async () => {
  if (draftId.value) {
    try {
      const data = await $fetch<{ content: string }>(
        `/api/editor/drafts/${draftId.value}`,
        { credentials: 'include' }
      )
      html.value = data.content
    } catch {
      // 草稿不存在或过期，使用空内容
    }
  }
  bridge.postMessage({ type: 'ready' })
})

watch(html, () => {
  if (!draftId.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveStatus.value = 'saving'
  saveTimer = setTimeout(async () => {
    try {
      await $fetch(`/api/editor/drafts/${draftId.value}`, {
        method: 'PUT',
        body: { content: html.value },
        credentials: 'include'
      })
      saveStatus.value = 'saved'
      bridge.postMessage({ type: 'update', html: html.value })
    } catch {
      saveStatus.value = 'error'
    }
  }, 1000)
})

async function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (!draftId.value) return
  try {
    await $fetch(`/api/editor/drafts/${draftId.value}`, {
      method: 'PUT',
      body: { content: html.value },
      credentials: 'include'
    })
    saveStatus.value = 'saved'
  } catch {
    saveStatus.value = 'error'
  }
}

async function onComplete() {
  await flushSave()
  bridge.done({ draftId: draftId.value, html: html.value })
}

function onCancel() {
  bridge.cancel()
}

// ===== 媒体上传 =====
async function handleFileSelect(type: 'image' | 'video' | 'audio') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const result = await uploadMediaFile(file, type)
      const editor = editorRef.value?.editor
      if (!editor) return
      if (type === 'image') {
        editor.chain().focus().setImage({ src: result.url }).run()
      } else if (type === 'video') {
        editor.chain().focus().insertContent({ type: 'video', attrs: { src: result.url } }).run()
      } else {
        editor.chain().focus().insertContent({ type: 'audio', attrs: { src: result.url } }).run()
      }
    } catch (err) {
      toast.add({ title: '上传失败', description: String(err), color: 'error' })
    }
  }
  input.click()
}

// ===== 链接插入 =====
function insertLink() {
  const editor = editorRef.value?.editor
  if (!editor) return
  const href = window.prompt('输入链接地址（http:// 或 https://）')
  if (!href) return
  editor.chain().focus().setLink({ href, target: '_blank' }).run()
}

// ===== 工具栏辅助 =====
function exec(fn: (chain: any) => any) {
  const editor = editorRef.value?.editor
  if (!editor) return
  fn(editor.chain().focus())
}

const fontFamilies = [
  { label: '默认', value: '' },
  { label: '衬线', value: 'serif' },
  { label: '等宽', value: 'monospace' }
]

const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px']

const colors = [
  '#000000', '#444444', '#888888', '#cccccc', '#ffffff',
  '#ff0000', '#ff8800', '#ffff00', '#00cc00', '#0088ff',
  '#0000ff', '#8800ff', '#ff0088', '#884400', '#008888'
]

const savedTime = computed(() => {
  if (saveStatus.value !== 'saved') return ''
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white">
    <!-- 吸顶工具栏 -->
    <div class="sticky top-0 z-10 border-b bg-white px-2 py-1 flex flex-wrap items-center gap-1">
      <UButton icon="i-lucide-undo" variant="ghost" size="xs" @click="exec(c => c.undo().run())" />
      <UButton icon="i-lucide-redo" variant="ghost" size="xs" @click="exec(c => c.redo().run())" />
      <USeparator orientation="vertical" />
      <UButton label="H1" variant="ghost" size="xs" @click="exec(c => c.toggleHeading({ level: 1 }).run())" />
      <UButton label="H2" variant="ghost" size="xs" @click="exec(c => c.toggleHeading({ level: 2 }).run())" />
      <UButton label="H3" variant="ghost" size="xs" @click="exec(c => c.toggleHeading({ level: 3 }).run())" />
      <USeparator orientation="vertical" />
      <USelect
        :items="fontFamilies"
        item-label="label"
        item-value="value"
        size="xs"
        placeholder="字体"
        @update:model-value="exec(c => c.setFontFamily($event).run())"
      />
      <USelect
        :items="fontSizes"
        size="xs"
        placeholder="字号"
        @update:model-value="exec(c => c.setFontSize($event).run())"
      />
      <USeparator orientation="vertical" />
      <UButton icon="i-lucide-bold" variant="ghost" size="xs" @click="exec(c => c.toggleBold().run())" />
      <UButton icon="i-lucide-italic" variant="ghost" size="xs" @click="exec(c => c.toggleItalic().run())" />
      <UButton icon="i-lucide-underline" variant="ghost" size="xs" @click="exec(c => c.toggleUnderline().run())" />
      <UButton icon="i-lucide-strikethrough" variant="ghost" size="xs" @click="exec(c => c.toggleStrike().run())" />
      <USeparator orientation="vertical" />
      <UPopover>
        <UButton icon="i-lucide-palette" variant="ghost" size="xs" />
        <template #content>
          <div class="grid grid-cols-5 gap-1 p-2">
            <UButton
              v-for="color in colors"
              :key="color"
              :style="{ backgroundColor: color }"
              size="xs"
              @click="exec(c => c.setColor(color).run())"
            />
          </div>
        </template>
      </UPopover>
      <UPopover>
        <UButton icon="i-lucide-highlighter" variant="ghost" size="xs" />
        <template #content>
          <div class="grid grid-cols-5 gap-1 p-2">
            <UButton
              v-for="color in colors"
              :key="color"
              :style="{ backgroundColor: color }"
              size="xs"
              @click="exec(c => c.toggleHighlight({ color }).run())"
            />
          </div>
        </template>
      </UPopover>
      <USeparator orientation="vertical" />
      <UButton icon="i-lucide-align-left" variant="ghost" size="xs" @click="exec(c => c.setTextAlign('left').run())" />
      <UButton icon="i-lucide-align-center" variant="ghost" size="xs" @click="exec(c => c.setTextAlign('center').run())" />
      <UButton icon="i-lucide-align-right" variant="ghost" size="xs" @click="exec(c => c.setTextAlign('right').run())" />
      <UButton icon="i-lucide-align-justify" variant="ghost" size="xs" @click="exec(c => c.setTextAlign('justify').run())" />
      <USeparator orientation="vertical" />
      <UButton icon="i-lucide-list" variant="ghost" size="xs" @click="exec(c => c.toggleBulletList().run())" />
      <UButton icon="i-lucide-list-ordered" variant="ghost" size="xs" @click="exec(c => c.toggleOrderedList().run())" />
      <USeparator orientation="vertical" />
      <UButton icon="i-lucide-link" variant="ghost" size="xs" @click="insertLink" />
      <UButton icon="i-lucide-image" variant="ghost" size="xs" @click="handleFileSelect('image')" />
      <UButton icon="i-lucide-video" variant="ghost" size="xs" @click="handleFileSelect('video')" />
      <UButton icon="i-lucide-music" variant="ghost" size="xs" @click="handleFileSelect('audio')" />
      <USeparator orientation="vertical" />
      <UButton icon="i-lucide-eraser" variant="ghost" size="xs" @click="exec(c => c.unsetAllMarks().clearNodes().run())" />
    </div>

    <!-- 编辑器 -->
    <div class="flex-1 overflow-auto">
      <ClientOnly>
        <UEditor
          ref="editorRef"
          v-model="html"
          content-type="html"
          :extensions="extensions"
          :starter-kit="{ link: { openOnClick: false } }"
          class="prose max-w-none p-4"
        />
        <template #fallback>
          <div class="flex items-center justify-center py-20">
            <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- 底部操作栏 -->
    <div class="sticky bottom-0 z-10 border-t bg-white px-4 py-2 flex items-center justify-between">
      <UButton label="取消" variant="ghost" @click="onCancel" />
      <span class="text-sm text-gray-500">
        {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? `已保存 ${savedTime}` : saveStatus === 'error' ? '未保存' : '' }}
      </span>
      <UButton label="完成" color="primary" @click="onComplete" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: lint + typecheck**

Run: `cd backend && bun run lint && bun run typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add backend/app/pages/rich-editor.vue
git commit -m "feat: add rich editor page with UEditor and custom tiptap extensions"
```

---

## Task 9: 前端 API editor.ts

**Files:**
- Create: `frontend/src/api/editor.ts`

- [ ] **Step 1: 写 API**

Create `frontend/src/api/editor.ts`:

```ts
import { http } from '@/http/alova'

export interface DraftResult {
  id: string
  content: string
  updatedAt: string
}

/** 创建草稿。 */
export function createDraft(data: { content: string }): Promise<DraftResult> {
  return http.Post('/editor/drafts', data) as unknown as Promise<DraftResult>
}

/** 取草稿内容。 */
export function getDraft(id: string): Promise<DraftResult> {
  return http.Get(`/editor/drafts/${id}`) as unknown as Promise<DraftResult>
}

/** 更新草稿内容。 */
export function updateDraft(id: string, data: { content: string }): Promise<{ updatedAt: string }> {
  return http.Put(`/editor/drafts/${id}`, data) as unknown as Promise<{ updatedAt: string }>
}

/** 删除草稿。 */
export function deleteDraft(id: string): Promise<void> {
  return http.Delete(`/editor/drafts/${id}`) as unknown as Promise<void>
}
```

- [ ] **Step 2: typecheck**

Run: `cd frontend && bun run type-check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/editor.ts
git commit -m "feat: add editor draft API client"
```

---

## Task 10: useRichEditor composable + 单测

**Files:**
- Create: `frontend/src/composables/useRichEditor.ts`
- Test: `frontend/src/composables/useRichEditor.test.ts`

> `openRichEditor` 返回 Promise，建草稿 → navigateTo 宿主页 → 通过 `uni.$on/$emit` 事件总线接收 done/cancel → done 时 GET 草稿最终 HTML。桥消息归约函数 `parseBridgeMessage` 为纯函数，可单测。

- [ ] **Step 1: 写桥消息归约函数单测（TDD）**

Create `frontend/src/composables/useRichEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseBridgeMessage } from './useRichEditor'

describe('parseBridgeMessage', () => {
  it('accepts valid done message', () => {
    const msg = { source: 'txwx-rich-editor', type: 'done', draftId: 'abc', html: '<p></p>' }
    expect(parseBridgeMessage(msg)).toEqual(msg)
  })

  it('accepts valid cancel message', () => {
    const msg = { source: 'txwx-rich-editor', type: 'cancel' }
    expect(parseBridgeMessage(msg)).toEqual(msg)
  })

  it('accepts valid update message', () => {
    const msg = { source: 'txwx-rich-editor', type: 'update', html: '<p>hi</p>' }
    expect(parseBridgeMessage(msg)).toEqual(msg)
  })

  it('rejects wrong source', () => {
    expect(parseBridgeMessage({ source: 'other', type: 'done' })).toBeNull()
  })

  it('rejects unknown type', () => {
    expect(parseBridgeMessage({ source: 'txwx-rich-editor', type: 'unknown' })).toBeNull()
  })

  it('rejects non-object', () => {
    expect(parseBridgeMessage(null)).toBeNull()
    expect(parseBridgeMessage('string')).toBeNull()
    expect(parseBridgeMessage(123)).toBeNull()
  })

  it('rejects missing source', () => {
    expect(parseBridgeMessage({ type: 'done' })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && bun run test -- useRichEditor`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 写实现**

Create `frontend/src/composables/useRichEditor.ts`:

```ts
import { createDraft, getDraft } from '@/api/editor'

const SOURCE = 'txwx-rich-editor'
const VALID_TYPES = ['ready', 'update', 'done', 'cancel', 'error'] as const

export interface BridgeMessage {
  source: typeof SOURCE
  type: (typeof VALID_TYPES)[number]
  [key: string]: unknown
}

export interface RichEditorResult {
  html: string
}

interface OpenOptions {
  initial?: string
}

/**
 * 桥消息协议归约：校验 source 与 type，非法消息返回 null。
 */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!data || typeof data !== 'object') return null
  const msg = data as Record<string, unknown>
  if (msg.source !== SOURCE) return null
  if (!VALID_TYPES.includes(msg.type as (typeof VALID_TYPES)[number])) return null
  return data as unknown as BridgeMessage
}

/**
 * 打开富文本编辑器。建草稿 → 跳转宿主页 → 事件总线接收 done/cancel。
 * done 时 GET 草稿最终 HTML（以服务端为准）；cancel/系统返回 → null。
 */
export function openRichEditor(options: OpenOptions = {}): Promise<RichEditorResult | null> {
  return new Promise(async (resolve) => {
    let draftId: string

    try {
      const draft = await createDraft({ content: options.initial ?? '' })
      draftId = draft.id
    } catch {
      uni.showToast({ title: '创建草稿失败', icon: 'none' })
      resolve(null)
      return
    }

    const onDone = async (data: { draftId: string }) => {
      cleanup()
      try {
        const draft = await getDraft(data.draftId)
        resolve({ html: draft.content })
      } catch {
        resolve(null)
      }
    }

    const onCancel = () => {
      cleanup()
      resolve(null)
    }

    function cleanup() {
      uni.$off('rich-editor:done', onDone)
      uni.$off('rich-editor:cancel', onCancel)
    }

    uni.$on('rich-editor:done', onDone)
    uni.$on('rich-editor:cancel', onCancel)

    uni.navigateTo({ url: `/pages/webview/editor/index?draftId=${draftId}` })
  })
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && bun run test -- useRichEditor`
Expected: PASS

- [ ] **Step 5: typecheck + lint**

Run: `cd frontend && bun run type-check && bun run lint`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useRichEditor.ts frontend/src/composables/useRichEditor.test.ts
git commit -m "feat: add useRichEditor composable with bridge message parsing"
```

---

## Task 11: 前端宿主页

**Files:**
- Create: `frontend/src/pages/webview/editor/index.vue`

> 条件编译双模板：H5 用 iframe + window message 监听；微信用 web-view + @message（仅返回时投递）。复用 admin 页模式：校验登录 → 生成 ott → 拼 `${ADMIN}/sso-login#ott=...&redirect=/rich-editor?draft=xxx`。收到完成消息后 `uni.$emit` 转发给 openRichEditor 并 navigateBack。

- [ ] **Step 1: 写宿主页**

Create `frontend/src/pages/webview/editor/index.vue`:

```vue
<script lang="ts" setup>
import { generateOneTimeToken } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getEnvBaseUrl } from '@/utils'
import { parseBridgeMessage } from '@/composables/useRichEditor'

definePage({
  style: {
    navigationBarTitleText: '富文本编辑',
  },
})

const auth = useAuthStore()

const webSrc = ref<string | null>(null)
const loading = ref(true)

function resolveAdminBase(): string {
  return (import.meta.env.VITE_ADMIN_WEB_URL || getEnvBaseUrl()).replace(/\/+$/, '')
}

async function buildUrl(): Promise<string> {
  const { token } = await generateOneTimeToken()
  const draftId = (auth as any).draftId || ''
  const redirect = `/rich-editor?draft=${encodeURIComponent(draftId)}`
  const hash = `ott=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`
  return `${resolveAdminBase()}/sso-login#${hash}`
}

// H5: iframe 消息监听
// #ifdef H5
function onMessage(event: MessageEvent) {
  const msg = parseBridgeMessage(event.data)
  if (!msg) return
  if (msg.type === 'done') {
    uni.$emit('rich-editor:done', { draftId: msg.draftId })
    uni.navigateBack()
  } else if (msg.type === 'cancel') {
    uni.$emit('rich-editor:cancel')
    uni.navigateBack()
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onMessage)
})
// #endif

// 微信: web-view @message 事件（仅返回时投递）
// #ifndef H5
function onWebviewMessage(e: any) {
  const data = e.detail?.data
  if (!Array.isArray(data)) return
  // 微信 postMessage 是数组，取最后一条
  const msg = parseBridgeMessage(data[data.length - 1])
  if (!msg) return
  if (msg.type === 'done') {
    uni.$emit('rich-editor:done', { draftId: msg.draftId })
    uni.navigateBack()
  } else if (msg.type === 'cancel') {
    uni.$emit('rich-editor:cancel')
    uni.navigateBack()
  }
}
// #endif

onLoad((options) => {
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  // 将 draftId 存入页面状态供 buildUrl 使用
  const draftId = (options as any)?.draftId || ''
  ;(auth as any).draftId = draftId

  buildUrl()
    .then((url) => {
      webSrc.value = url
    })
    .catch(() => {
      uni.navigateBack()
    })
    .finally(() => {
      loading.value = false
    })
})
</script>

<template>
  <view class="min-h-screen bg-page">
    <!-- #ifdef H5 -->
    <iframe
      v-if="webSrc"
      :src="webSrc"
      class="w-full h-screen border-0"
    />
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <web-view
      v-if="webSrc"
      :src="webSrc"
      @message="onWebviewMessage"
    />
    <!-- #endif -->
    <view v-if="loading" class="min-h-screen flex flex-col items-center justify-center gap-3">
      <view class="i-carbon-renew animate-spin text-7 text-primary" />
      <text class="text-4 text-muted">正在准备免登录链接…</text>
    </view>
  </view>
</template>
```

- [ ] **Step 2: typecheck**

Run: `cd frontend && bun run type-check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/webview/editor/index.vue
git commit -m "feat: add webview editor host page with H5/WeChat conditional compilation"
```

---

## Task 12: rich-viewer 组件 + rich-link.ts + 单测

**Files:**
- Create: `frontend/src/components/rich-viewer/rich-viewer.vue`
- Create: `frontend/src/components/rich-viewer/rich-link.ts`
- Create: `frontend/src/components/rich-viewer/rich-link.test.ts`

> 从 feature/richtext-editor 分支移植。rich-link.ts 从旧分支的 rich-editor 目录移到 rich-viewer 目录（因为编辑功能已移至后端）。rich-viewer.vue 保持不变。

- [ ] **Step 1: 写 rich-link.ts**

Create `frontend/src/components/rich-viewer/rich-link.ts`:

```ts
/**
 * 富文本编辑器链接地址归一化（供 rich-viewer 的链接处理使用）：
 * - 去除首尾空白，空值返回 null；
 * - 仅放行 http(s)://、mailto:、tel: 三种协议，javascript:/data:/vbscript: 等一律拒绝；
 * - 协议相对地址（//host/path）补 https:；
 * - 无协议但形似域名（example.com / www.a.cn:8080/p）补 https://；
 * - 其余无法识别的输入（纯文字、相对路径等）返回 null。
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i
// 域名形态：至少一个点，TLD 为 2+ 字母；标签仅允许字母数字与连字符且不以连字符开头/结尾
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i

export function normalizeLinkUrl(input: string): string | null {
  const url = input.trim()
  if (!url)
    return null

  // 协议相对地址 //example.com/path → https://example.com/path
  if (url.startsWith('//')) {
    const rest = url.slice(2)
    return DOMAIN_RE.test(rest) ? `https:${url}` : null
  }

  const schemeMatch = SCHEME_RE.exec(url)
  if (schemeMatch) {
    const protocol = `${schemeMatch[1].toLowerCase()}:`
    if (!ALLOWED_PROTOCOLS.has(protocol)) {
      // 形如 www.example.com:8080/path 的输入会被 scheme 正则误判为「协议:」；
      // 真实协议名不含点，含点时按 host:port 形态走域名补全
      if (schemeMatch[1].includes('.'))
        return DOMAIN_RE.test(url) ? `https://${url}` : null
      return null
    }
    const rest = url.slice(schemeMatch[0].length)
    if (protocol === 'http:' || protocol === 'https:') {
      // 必须带非空主机名（拒绝 http://、http:///path 这类残缺地址）
      if (!/^\/\/[^\s/?#]+/.test(rest))
        return null
    }
    else if (!rest.trim()) {
      // mailto:/tel: 后必须有实际内容
      return null
    }
    return url
  }

  // 含空白（纯文字/句子）或以 / 开头（站内相对路径）均不可作为外链
  if (/\s/.test(url) || url.startsWith('/'))
    return null

  return DOMAIN_RE.test(url) ? `https://${url}` : null
}
```

- [ ] **Step 2: 写 rich-link 单测**

Create `frontend/src/components/rich-viewer/rich-link.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeLinkUrl } from './rich-link'

describe('normalizeLinkUrl', () => {
  it('keeps valid http(s) urls unchanged', () => {
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeLinkUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(normalizeLinkUrl('https://example.com:8080/path')).toBe('https://example.com:8080/path')
  })

  it('accepts uppercase protocol spellings', () => {
    expect(normalizeLinkUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM')
  })

  it('prepends https:// for domain-like input without protocol', () => {
    expect(normalizeLinkUrl('example.com')).toBe('https://example.com')
    expect(normalizeLinkUrl('www.example.com:8080/path?q=1')).toBe('https://www.example.com:8080/path?q=1')
    expect(normalizeLinkUrl('foo.bar/')).toBe('https://foo.bar/')
    expect(normalizeLinkUrl('sub.example.com:443')).toBe('https://sub.example.com:443')
  })

  it('does not treat host:port as a dangerous scheme', () => {
    expect(normalizeLinkUrl('evil.com:alert(1)')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeLinkUrl('  example.com  ')).toBe('https://example.com')
  })

  it('upgrades protocol-relative urls to https', () => {
    expect(normalizeLinkUrl('//example.com/a')).toBe('https://example.com/a')
  })

  it('allows mailto: and tel: urls', () => {
    expect(normalizeLinkUrl('mailto:foo@bar.com')).toBe('mailto:foo@bar.com')
    expect(normalizeLinkUrl('tel:+8613800000000')).toBe('tel:+8613800000000')
  })

  it('rejects javascript: and other dangerous protocols', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeLinkUrl('JavaScript:alert(1)')).toBeNull()
    expect(normalizeLinkUrl('data:text/html,<script>')).toBeNull()
    expect(normalizeLinkUrl('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeLinkUrl('file:///etc/passwd')).toBeNull()
  })

  it('rejects empty and whitespace-only input', () => {
    expect(normalizeLinkUrl('')).toBeNull()
    expect(normalizeLinkUrl('   ')).toBeNull()
  })

  it('rejects plain text, relative paths and malformed urls', () => {
    expect(normalizeLinkUrl('hello world')).toBeNull()
    expect(normalizeLinkUrl('/pages/index/index')).toBeNull()
    expect(normalizeLinkUrl('example')).toBeNull()
    expect(normalizeLinkUrl('-bad.com')).toBeNull()
    expect(normalizeLinkUrl('example .com')).toBeNull()
    expect(normalizeLinkUrl('http://')).toBeNull()
    expect(normalizeLinkUrl('http:///path')).toBeNull()
    expect(normalizeLinkUrl('//not-a-domain')).toBeNull()
    expect(normalizeLinkUrl('mailto:')).toBeNull()
  })
})
```

- [ ] **Step 3: 运行 rich-link 单测**

Run: `cd frontend && bun run test -- rich-link`
Expected: PASS

- [ ] **Step 4: 写 rich-viewer.vue**

Create `frontend/src/components/rich-viewer/rich-viewer.vue`:

```vue
<script setup lang="ts">
import { onHide } from '@dcloudio/uni-app'

/**
 * 富文本只读渲染器（mp-html 封装）。
 *
 * - content 响应式，更新即重新解析渲染；
 * - 外链：H5 以 noopener 新标签打开，非 H5 复制链接提示浏览器打开；
 * - #锚点与站内相对链接交由 mp-html 内部处理（滚动 / uni.navigateTo）；
 * - 页面隐藏或组件卸载时暂停音视频播放。
 */
interface ErrorDetail {
  source?: string
  attrs?: Record<string, unknown>
  errMsg?: string
}

withDefaults(defineProps<{
  content?: string
  emptyText?: string
}>(), {
  content: '',
  emptyText: '暂无内容',
})

const emit = defineEmits<{
  error: [detail: ErrorDetail]
}>()

const mpRef = ref<any>(null)

const TAG_STYLE: Record<string, string> = {
  img: 'max-width:100%',
  video: 'width:100%',
  a: 'color:var(--c-primary)',
}

function getCtx(): any {
  const r = mpRef.value
  if (!r) return null
  if (typeof r.pauseMedia === 'function') return r
  const ctx = r.$vm ?? r.context ?? r
  return typeof ctx?.pauseMedia === 'function' ? ctx : null
}

function pauseMedia() {
  getCtx()?.pauseMedia()
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const EXTERNAL_OK_RE = /^(?:https?:|mailto:|tel:)/i

function onLinkTap(attrs: Record<string, unknown> | undefined) {
  const href = String(attrs?.href || '').trim()
  if (!href) return
  if (href.startsWith('#')) return
  if (!SCHEME_RE.test(href)) return
  if (!EXTERNAL_OK_RE.test(href)) return
  // #ifdef H5
  window.open(href, '_blank', 'noopener')
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: href,
    success: () => uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }),
  })
  // #endif
}

function onError(detail: ErrorDetail) {
  emit('error', detail)
}

onHide(() => pauseMedia())
onUnmounted(() => pauseMedia())

defineExpose({ pauseMedia })
</script>

<template>
  <view class="rich-viewer">
    <mp-html
      v-if="content"
      ref="mpRef"
      :content="content"
      :use-anchor="true"
      preview-img="all"
      :copy-link="false"
      :pause-video="true"
      :tag-style="TAG_STYLE"
      @linktap="onLinkTap"
      @error="onError"
    />
    <view v-else class="px-3 py-8 text-center text-sm text-muted">
      {{ emptyText }}
    </view>
  </view>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/rich-viewer/
git commit -m "feat: add rich-viewer component with rich-link normalization"
```

---

## Task 13: vendor 脚本 + 前端配置

**Files:**
- Create: `frontend/scripts/vendor-mp-html.mjs`
- Generate: `frontend/src/components/mp-html/` (vendor 脚本产物)
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/eslint.config.mjs`

> vendor 脚本从 feature/richtext-editor 分支移植，裁掉 editable 插件及其全部 H5 补丁（气泡菜单坐标/图标/换行补丁都不再需要），仅保留 audio 插件。由于 mp-html 组件为 vendored 第三方产物，需从 tsconfig 和 eslint 中排除。

- [ ] **Step 1: 从旧分支获取 vendor 脚本并裁剪**

从 feature/richtext-editor 分支获取 vendor 脚本：

```bash
cd frontend && git show feature/richtext-editor:frontend/scripts/vendor-mp-html.mjs > scripts/vendor-mp-html.mjs
```

然后对 `scripts/vendor-mp-html.mjs` 做以下修改：

1. **plugins 列表**：将 `plugins: ['audio', 'editable']` 改为 `plugins: ['audio']`（裁掉 editable）
2. **删除所有 editable 相关的 H5 补丁**：删除所有涉及 editable 气泡菜单坐标修复（touches/changedTouches pageY）、editable 菜单项图标映射、菜单 CSS inline-flex/flex-wrap 补丁的代码段
3. **plugins 正则匹配**：确保 `plugins:\s*\[[\s\S]*?\n\s*\]` 正则仍然有效（线性匹配模式，单引号）

验证修改后的脚本中不再包含 `editable` 关键词：

```bash
cd frontend && grep -c "editable" scripts/vendor-mp-html.mjs
```

Expected: 0（不含 editable）

- [ ] **Step 2: 在 package.json 中添加 vendor 脚本命令**

在 `frontend/package.json` 的 `scripts` 中添加：

```json
"vendor:mp-html": "node scripts/vendor-mp-html.mjs"
```

- [ ] **Step 3: 运行 vendor 脚本生成 mp-html 组件**

Run:
```bash
cd frontend && bun run vendor:mp-html
```

Expected: 生成 `frontend/src/components/mp-html/` 目录及组件文件

- [ ] **Step 4: tsconfig.json 添加 mp-html 到 exclude**

在 `frontend/tsconfig.json` 的 `exclude` 数组中添加 mp-html 目录：

将：
```json
"exclude": ["node_modules", "dist"]
```

改为：
```json
"exclude": ["node_modules", "dist", "src/components/mp-html"]
```

- [ ] **Step 5: eslint.config.mjs 添加 mp-html 到 ignores**

在 `frontend/eslint.config.mjs` 的 `ignores` 数组中添加：

```js
// mp-html 第三方组件产物（vendor 构建），不参与 lint
'src/components/mp-html/**',
```

- [ ] **Step 6: typecheck + lint**

Run: `cd frontend && bun run type-check && bun run lint`
Expected: 无错误

- [ ] **Step 7: 运行全部前端测试**

Run: `cd frontend && bun run test`
Expected: 全部 PASS（rich-link + useRichEditor）

- [ ] **Step 8: Commit**

```bash
git add frontend/scripts/vendor-mp-html.mjs frontend/package.json frontend/src/components/mp-html/ frontend/tsconfig.json frontend/eslint.config.mjs
git commit -m "feat: add mp-html vendor script (audio only) and exclude from typecheck/lint"
```

---

## Task 14: 演示页

**Files:**
- Create: `frontend/src/pages/richtext/demo.vue`

> 演示页展示 rich-viewer 渲染 + 「编辑内容」按钮走完整闭环（openRichEditor）。旧版 demo 使用 rich-editor 组件，新版改为调用 openRichEditor 打开 web-view 编辑器。

- [ ] **Step 1: 写演示页**

Create `frontend/src/pages/richtext/demo.vue`:

```vue
<script lang="ts" setup>
import { openRichEditor } from '@/composables/useRichEditor'

definePage({
  style: {
    navigationBarTitleText: '富文本演示',
  },
})

usePageTitle('富文本演示')

interface ViewerError {
  source?: string
  attrs?: Record<string, unknown>
  errMsg?: string
}

const tips = [
  '点击「编辑内容」按钮进入富文本编辑器（WebView 加载后端编辑器页）。',
  '编辑器支持图片、视频、音频上传（走 COS 直传），以及全部文本样式与列表。',
  '编辑完成后点击「完成」按钮，内容自动同步回本页预览区。',
  '链接仅允许 http(s)/mailto/tel，预览区点击外链：H5 新标签打开，小程序端复制后到浏览器打开。',
]

const initialHtml = [
  '<h3>富文本能力演示</h3>',
  '<p>这是一段示例文字，演示 <strong>粗体</strong>、<em>斜体</em>、<u>下划线</u> 与 <span style="color:#16a34a">彩色文字</span>。</p>',
  '<p>无序列表：</p>',
  '<ul><li>图文混排</li><li>音视频播放</li><li>链接管理</li></ul>',
  '<p>有序列表：</p>',
  '<ol><li>点击编辑按钮进入编辑器</li><li>在 WebView 中编辑内容</li><li>完成后同步回预览</li></ol>',
  '<p><a href="https://mp-html.pages.dev/">点此访问 mp-html 文档（外链示例）</a></p>',
].join('')

const html = ref(initialHtml)
const editing = ref(false)

const charCount = computed(() => html.value.length)

const SOURCE_LABEL: Record<string, string> = {
  img: '图片',
  video: '视频',
  audio: '音频',
}

async function onEdit() {
  editing.value = true
  const result = await openRichEditor({ initial: html.value })
  editing.value = false
  if (result) {
    html.value = result.html
    uni.showToast({ title: '内容已更新', icon: 'success' })
  }
}

function onViewerError(detail: ViewerError) {
  const label = (detail.source && SOURCE_LABEL[detail.source]) || '媒体'
  uni.showToast({ title: `${label}加载失败`, icon: 'none' })
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- 操作指引 -->
    <view class="border border-line rounded-xl bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <view class="i-carbon-information text-5 text-primary" />
        <text class="ml-2 text-4 text-ink font-medium">操作指引</text>
      </view>
      <view v-for="(tip, i) in tips" :key="i" class="mt-2.5 flex items-start">
        <view class="text-primary-soft-text mr-2.5 mt-0.5 h-5 w-5 center shrink-0 rounded-full bg-primary-soft text-3">
          {{ i + 1 }}
        </view>
        <text class="flex-1 text-3.5 text-muted leading-5">{{ tip }}</text>
      </view>
    </view>

    <!-- 预览区 -->
    <view class="mt-4">
      <view class="mb-2 flex items-baseline justify-between px-1">
        <text class="text-4 text-ink font-medium">预览区</text>
        <text class="text-3 text-muted">{{ charCount }} 字符</text>
      </view>
      <view class="border border-line rounded-xl bg-card p-4">
        <rich-viewer :content="html" @error="onViewerError" />
      </view>
    </view>

    <!-- 编辑按钮 -->
    <view class="mt-4">
      <button
        class="w-full rounded-xl bg-primary py-3 text-4 text-white"
        :class="{ 'opacity-50': editing }"
        :disabled="editing"
        @tap="onEdit"
      >
        {{ editing ? '编辑中…' : '编辑内容' }}
      </button>
    </view>
  </view>
</template>
```

- [ ] **Step 2: typecheck + lint**

Run: `cd frontend && bun run type-check && bun run lint`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/richtext/demo.vue
git commit -m "feat: add richtext demo page with openRichEditor integration"
```

---

## Task 15: 端到端冒烟验证

> 启动后端 + 前端 H5，在浏览器中验证完整闭环。

- [ ] **Step 1: 启动后端**

Run: `cd backend && bun run dev`
Expected: Nuxt dev server 在 http://localhost:3000 启动

- [ ] **Step 2: 启动前端 H5**

Run: `cd frontend && bun run dev:h5`
Expected: H5 dev server 在 http://localhost:9000 启动

- [ ] **Step 3: 浏览器验证完整闭环**

在浏览器中打开 http://localhost:9000 并完成以下用例：

1. **登录**：使用管理员账号登录
2. **进入演示页**：导航到富文本演示页
3. **点击编辑**：点击「编辑内容」按钮
4. **验证跳转**：页面跳转到宿主页，加载编辑器
5. **验证免登录**：编辑器页自动通过 ott 免登录，无需再次登录
6. **文本样式**：在编辑器中输入文字，测试加粗/斜体/下划线/删除线/颜色/字号/字体
7. **对齐方式**：测试左对齐/居中/右对齐/两端对齐
8. **列表**：测试有序列表和无序列表
9. **链接**：插入超链接，验证 target=_blank
10. **图片上传**：插入图片，验证 COS 直传成功
11. **视频上传**：插入视频
12. **音频上传**：插入音频
13. **自动保存**：等待 1 秒，验证底部显示「已保存 HH:mm」
14. **完成**：点击「完成」按钮，验证返回演示页且内容已更新
15. **取消**：再次编辑，点击「取消」按钮，验证返回且内容不变

- [ ] **Step 4: 验证渲染一致性**

对比编辑器输出的 HTML 与 rich-viewer 渲染结果：
- 标题、段落、列表样式一致
- 图片/视频/音频正常显示
- 链接可点击（H5 新标签打开）
- 颜色/字号/字体/对齐样式保持

- [ ] **Step 5: 运行全量门禁**

Run（两个工程分别执行）:
```bash
cd backend && bun run lint && bun run typecheck && bun run test
cd frontend && bun run lint && bun run type-check && bun run test
```

Expected: 全部通过

---

## Self-Review

### 1. Spec 覆盖检查

| Spec 要求 | 对应 Task |
|-----------|-----------|
| editor_draft 表（id/user_id/content/created_at/updated_at） | Task 1 |
| TTL 7 天惰性清理 | Task 2 (isDraftExpired/buildExpiryCutoff) + Task 3 (deleteExpiredDraftsByUser) + Task 4 (POST 创建时清理) |
| POST/GET/PUT/DELETE /api/editor/drafts[/:id] | Task 4 |
| 属主过滤（不匹配 404） | Task 2 (assertDraftOwnership) + Task 4 |
| Zod 校验（100 万字符上限） | Task 3 (DRAFT_CONTENT_MAX) |
| 编辑器页 rich-editor.vue（layout:false, ClientOnly UEditor） | Task 8 |
| Tiptap 扩展（TextAlign/TextStyle+Color/Highlight/FontFamily/FontSize/Video/Audio） | Task 5 (安装) + Task 8 (自定义实现) |
| COS 浏览器直传（crypto-js + PostObject + register） | Task 6 |
| 桥接 useEditorBridge.ts（H5 postMessage / 微信 wx.miniProgram） | Task 7 |
| 前端宿主页 webview/editor/index.vue（条件编译） | Task 11 |
| composable useRichEditor.ts | Task 10 |
| 前端 API editor.ts | Task 9 |
| rich-viewer + rich-link.ts 移植 | Task 12 |
| vendor 脚本（裁掉 editable） | Task 13 |
| 配置精简（tsconfig/eslint） | Task 13 |
| 演示页 | Task 14 |
| 自动化测试（后端 TTL/属主、前端 normalizeLinkUrl/桥消息归约） | Task 2, 10, 12 |
| 端到端冒烟 | Task 15 |

**缺口：** 无。所有 spec 要求均已覆盖。

### 2. 占位符扫描

搜索计划中的 "TBD"、"TODO"、"implement later"、"fill in"、"Add appropriate"、"Similar to Task" 等模式 — 未发现。所有步骤均包含完整代码或精确命令。

### 3. 类型一致性

- `EditorDraftRow` 在 Task 3 定义，Task 4 中 repository 函数返回该类型 — 一致
- `DraftResult` 在 Task 9 (前端 API) 定义，Task 10 (useRichEditor) 中 `getDraft` 返回该类型 — 一致
- `BridgeMessage` 在 Task 7 (后端 useEditorBridge) 和 Task 10 (前端 useRichEditor) 中分别定义但结构一致（`{source:'txwx-rich-editor', type, ...}`）— 两端独立定义，无跨工程类型引用
- `UploadResult` 在 Task 6 定义，Task 8 中 `uploadMediaFile` 返回该类型 — 一致
- `parseBridgeMessage` 在 Task 10 定义，Task 11 (宿主页) 中 import 使用 — 一致
- `createDraft`/`getDraft` 在 Task 9 定义，Task 10 中 import 使用 — 一致
- `normalizeLinkUrl` 在 Task 12 定义 — 一致（rich-viewer.vue 内部使用 SCHEME_RE/EXTERNAL_OK_RE 自行判断，与旧分支一致）

**类型一致，无冲突。**
