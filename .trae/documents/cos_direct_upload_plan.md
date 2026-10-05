# 腾讯云 COS 通用媒体能力（后端 + 管理后台）实施计划

## 一、仓库调研结论

### 现状

* 现有头像上传为**本地磁盘存储**：[avatar.post.ts](file:///d:/projects/tongxiangwuxie/backend/server/api/upload/avatar.post.ts) 接收 multipart 落盘 `backend/uploads/avatars/`，公开读取路由 [server/routes/api/uploads/avatars/\[file\].get.ts](file:///d:/projects/tongxiangwuxie/backend/server/routes/api/uploads/avatars/%5Bfile%5D.get.ts)，纯逻辑在 [server/utils/upload.ts](file:///d:/projects/tongxiangwuxie/backend/server/utils/upload.ts)（含单测）。**本次不动头像链路，两者并存。**

* 业务表在 [schema.ts](file:///d:/projects/tongxiangwuxie/backend/server/database/schema.ts)（post/role/user\_role）；迁移流程：改 schema → `bun run db:generate` → `bun run db:migrate`，当前迁移为 `drizzle/0000_*.sql`。

* 数据访问走 repositories（如 [posts.ts](file:///d:/projects/tongxiangwuxie/backend/server/database/repositories/posts.ts)）；入参走 `server/schemas/*` Zod；成功 `ok()/paginated()`，抛错 `createApiError()`；环境变量在 [env.ts](file:///d:/projects/tongxiangwuxie/backend/server/utils/env.ts) fail-fast。

* 管理后台约定：

  * admin 接口位于 `server/api/admin/**`（自动要求 `role.name === 'admin'`），分页写法参考 [admin/users/index.get.ts](file:///d:/projects/tongxiangwuxie/backend/server/api/admin/users/index.get.ts)：`parseQuery` → repository → `paginated(data, buildPaginationMeta(...))`；删除参考 [\[id\].delete.ts](file:///d:/projects/tongxiangwuxie/backend/server/api/admin/users/%5Bid%5D.delete.ts)，用 `requireAdmin(event)` + `parseParams`。

  * 后台页面位于 `app/pages/admin/`（Nuxt UI v4），参考 [users.vue](file:///d:/projects/tongxiangwuxie/backend/app/pages/admin/users.vue)：`$fetch(..., { credentials: 'include' })`、UTable 插槽 `${column.id}-cell` 取 `row.original`、UPagination `v-model:page` + `:total`、UModal 正文必须 `#body`。

  * 侧边栏导航在 [layouts/default.vue](file:///d:/projects/tongxiangwuxie/backend/app/layouts/default.vue#L15-L19)，新入口按 `adminOnly: true` 加入。

* `/api/media/**`、`/api/admin/media/**` 当前均无路由，不冲突；前者登录可用、后者仅 admin。

### 本次范围（已确认）

1. 后端新增**通用媒体能力**：`media_file` 表 + 支撑「前端直传」的两个接口（STS 临时凭证、直传后登记）。
2. 管理后台新增**媒体管理**：分页列表（类型筛选/关键词搜索）与删除。
3. `ref_count` **只由后端内部维护**：仅 repository 内部函数，**不开放任何 HTTP 接口**；删除时以它为引用护栏。
4. **不迁移头像**：`frontend/` 工程本次零改动；现有本地头像接口与读取路由全部保留。

### 方案选型

* **STS 临时密钥 + key 级最小授权**：后端用永久密钥调 `qcloud-cos-sts`，签发仅允许 `PutObject` 到单个服务端生成 key 的临时凭证；未来前端（H5/小程序，统一使用 `cos-js-sdk-v5`）拿到凭证直传 COS，文件流不经过后端；直传后调 register，后端用永久密钥 `headObject` 权威核实再入库。

* 删除：admin 触发，先删 COS 对象（对象已不存在视为成功），再删 DB 行；`ref_count > 0` 拒绝删除（409）。

## 二、media\_file 表结构

通用媒体表，表名 `media_file`，遵循项目约定（text UUID 主键、snake\_case 物理列、timestamptz）。**只有以下列**，其余属性一律放 `metadata` jsonb：

| 列           | 类型                              | 说明                                                    |
| ----------- | ------------------------------- | ----------------------------------------------------- |
| id          | text pk                         | `crypto.randomUUID()`                                 |
| url         | text notNull unique             | 完整访问地址（默认 COS 域名或 CDN 域名；唯一约束兼做对象去重）                  |
| type        | text notNull                    | 媒体类别：`image` / `video` / `audio` / `file`（应用层 Zod 校验） |
| ref\_count  | integer notNull default 0       | 被引用次数；仅后端内部函数维护，下限 0                                  |
| metadata    | jsonb notNull default `'{}'`    | 其他全部属性（见下）                                            |
| created\_at | timestamptz notNull default now | <br />                                                |

`metadata` JSON（TS 类型约束，键均可缺省）：

```jsonc
{
  "key": "images/<uuid>.jpg",   // COS 对象键（删对象/排查用）
  "bucket": "name-1250000000",
  "region": "ap-shanghai",
  "mimeType": "image/jpeg",     // 服务端 headObject 权威值
  "size": 123456,               // 服务端 headObject 权威字节数
  "etag": "...",
  "name": "原始文件名",          // 客户端上报，已清洗截断
  "width": 1920,                // 客户端上报（图片/视频）
  "height": 1080,
  "duration": 12.5              // 客户端上报秒（音视频）
}
```

* `key/bucket/region/mimeType/size/etag` 只由服务端写入；`name/width/height/duration` 由客户端上报（仅展示属性，放 JSON，不作为安全/计费判据）。

* `ref_count` 维护方式（仅后端，供未来业务模块调用）：repository 导出内部函数 `adjustRefCount(txOrDb, id, delta)`，SQL 用 `greatest(0, ref_count + delta)` 钳底；本次没有调用方，默认全为 0。

## 三、文件与模块（全部在 backend/）

* `server/database/schema.ts`：新增 `mediaFile` 表（引入 `integer`、`jsonb`）。

* `server/database/repositories/media.ts`（新建）：

  * `listMedia({ limit, offset, type?, keyword? })`；

  * `getMediaFileById` / `getMediaFileByUrl`；

  * `createMediaFile({ url, type, metadata })`；

  * `deleteMediaFileById(id)`；

  * `adjustRefCount(id, delta)`（内部维护，非 HTTP）。

* `server/utils/media.ts`（新建）：类型注册表（前缀/大小上限）、MIME 类别判定、key 生成与严格正则解析、appid 解析、URL 拼装、文件名清洗等纯逻辑。

* `server/utils/cos.ts`（新建）：COS 客户端单例（`cos-nodejs-sdk-v5`，永久密钥，仅服务端）、`headCosObject(key)`、`deleteCosObject(key)`（promisify；对象不存在不视为错误）。

* `server/utils/cos-sts.ts`（新建）：`getScopedPutCredential(key)` 调 `qcloud-cos-sts` 取单 key 临时凭证；COS 未配置时抛明确错误。

* `server/schemas/media.ts`（新建）：credentials、register、admin 列表查询三组 Zod schema。

* `server/api/media/credentials.post.ts`（新建）：`POST /api/media/credentials`（登录用户）。

* `server/api/media/register.post.ts`（新建）：`POST /api/media/register`（登录用户）。

* `server/api/admin/media/index.get.ts`（新建）：`GET /api/admin/media`（admin，分页+类型/关键词筛选）。

* `server/api/admin/media/[id].delete.ts`（新建）：`DELETE /api/admin/media/:id`（admin，引用护栏 + 删 COS 对象 + 删行）。

* `app/pages/admin/media/index.vue`（新建）：媒体管理页（预览、类型 Badge、URL、大小、引用数、时间、删除确认；类型筛选 + 关键词搜索 + 分页）。

* `app/layouts/default.vue`：侧边栏新增「媒体管理」入口（`adminOnly: true`，图标 `i-lucide-image-play` 或 `i-lucide-folder-image`）。

* `server/utils/env.ts`：新增 COS 环境变量（可选/带默认值，未配置时不影响应用启动，仅调用媒体接口报明确错误）。

* `.env.example`：补充 COS 配置模板（无真实密钥）。

* `server/utils/media.test.ts`（新建）：纯逻辑单测。

## 四、实施步骤（依赖顺序）

1. **加依赖**（backend/）：`bun add qcloud-cos-sts cos-nodejs-sdk-v5`。
2. **环境变量**：

   * env.ts 增加：`TENCENT_COS_SECRET_ID?`、`TENCENT_COS_SECRET_KEY?`、`TENCENT_COS_BUCKET?`、`TENCENT_COS_REGION`（默认 `ap-shanghai`）、`TENCENT_COS_DOMAIN?`（CDN/自定义域名，空则默认域名）、`TENCENT_COS_STS_TTL`（coerce number，默认 1800）。

   * `.env.example` 补同名模板与注释。
3. **media 纯逻辑** `server/utils/media.ts`：

   * `MEDIA_TYPES` 注册表（key 前缀 / 大小上限）：image → `images/` 10MB；video → `videos/` 500MB；audio → `audio/` 50MB；file → `files/` 50MB。

   * `isValidType(t)`；`getMimeCategory(mime)`（image/video/audio，其余 file）；`mimeMatchesType(type, mime)`；

   * `buildObjectKey(type, ext)` → `<prefix><uuid>.<ext>`；`parseObjectKey(key)`：严格正则解析 `{ type, id, ext }`，不匹配返回 null（防 `../`、伪造前缀）；

   * `getCosAppId(bucket)`：bucket 必须形如 `name-1250000000`，取末尾数字；

   * `buildObjectUrl(bucket, region, key)`：有 CDN 域名用域名，否则 `https://<bucket>.cos.<region>.myqcloud.com/<key>`；

   * `extFromMime(mime)`（常见类型映射）、`sanitizeFileName(name)`（截断 ≤200）。
4. **schema + 迁移**：schema.ts 加 `mediaFile`；`bun run db:generate`，人工检查 SQL（表结构、url 唯一索引、ref\_count 默认 0、metadata jsonb 默认 `'{}'`）后 `bun run db:migrate`。
5. **repository** `repositories/media.ts`：

   * 列表筛选：`type` 精确匹配；`keyword` 匹配 url 或 `metadata->>'name'`（drizzle sql 模板 ilike，`%`/`_`/`\` 转义）；按 created\_at desc。

   * `createMediaFile`、`getMediaFileById/Url`、`deleteMediaFileById`；

   * `adjustRefCount(id, delta)`：`sql` 更新 `greatest(0, ref_count + ${delta})` 并返回新行。
6. **COS/STS 封装**：

   * `cos.ts`：懒加载单例，密钥/bucket 缺失时调用方抛 `createApiError('INTERNAL_ERROR', { message: '对象存储未配置' })`；`headCosObject(key)` 返回 `{ contentLength, contentType, etag }`，对象不存在返回 null；`deleteCosObject(key)` 删除对象，404 不视为错误。

   * `cos-sts.ts`：policy version 2.0，单条 allow：action `name/cos:PutObject`，resource `qcs::cos:<region>:uid/<appid>:<bucket>/<key>`（key 级单资源）；durationSeconds 取 env；返回 `{ tmpSecretId, tmpSecretKey, sessionToken, startTime, expiredTime }`。
7. **Zod schemas** `server/schemas/media.ts`，均 `.strict()`：

   * credentials：`type` enum 四值、`contentType`（1–100）、`size`（int 正整数，可选）、`filename`（trim 1–200，可选）；

   * register：`key`（1–300）、`metadata`（可选对象，仅接收 `name?/width?/height?/duration?`，数值为正、范围合理）；

   * admin 列表：复用 `pageQuerySchema` + `keywordQuerySchema` + `type` enum 可选。
8. **接口 1** **`POST /api/media/credentials`**（登录用户）：

   * 校验 body → MIME 类别与 type 匹配（不匹配 422）；上报了 size 则校验 ≤ 类型上限；

   * 服务端生成 key → 调 STS → `ok()` 返回 `{ credential:{tmpSecretId,tmpSecretKey,sessionToken,startTime,expiredTime}, bucket, region, key, url }`；

   * STS 失败：记日志抛 INTERNAL\_ERROR，不泄露密钥信息。
9. **接口 2** **`POST /api/media/register`**（登录用户）：

   * 校验 body；`parseObjectKey(key)` 不合法 → 404；

   * `headCosObject`：不存在 → NOT\_FOUND；以服务端探测权威校验 MIME 类别与 key 推导出的 type 一致、contentLength ≤ 对应上限，否则 422；

   * url 已登记则直接返回该行（幂等）；否则插入：metadata = 服务端 `{key,bucket,region,mimeType,size,etag}` + 客户端上报的 `{name,width,height,duration}`；返回 `ok(mediaFile)`。
10. **admin 列表** **`GET /api/admin/media`**：`parseQuery` → `listMedia` → `paginated(...)`。
11. **admin 删除** **`DELETE /api/admin/media/:id`**：

    * `requireAdmin` + 参数校验；`getMediaFileById` 不存在 → NOT\_FOUND；

    * `ref_count > 0` → 409 `{ message: '该媒体仍被引用，无法删除' }`；

    * 取 metadata 中的 key → `deleteCosObject`（404 忽略）→ `deleteMediaFileById`；

    * 返回 `ok({ id }, '媒体已删除')`。
12. **后台页面** `app/pages/admin/media/index.vue`（对齐 users.vue 写法）：

    * 列：预览 / 类型 / 文件名·URL / 大小 / 引用数 / 创建时间 / 操作；

    * 预览：image 显示缩略图（`<img>` 限制高 40px），video/audio/file 显示对应 lucide 图标；URL 截断并可点击新窗口打开；

    * 筛选：类型 USelect（全部 + 四值）、关键词 UInput（搜 URL/文件名，防抖）；分页 UPagination；

    * 删除：UModal `#body` 二次确认（展示类型与 URL），调 DELETE 后刷新。
13. **侧边栏**：default.vue 在「角色管理」后加 `{ label: '媒体管理', to: '/admin/media', icon: 'i-lucide-folder-image', adminOnly: true }`。
14. **单测** `media.test.ts`：key 生成/解析正例与攻击例（`../`、错误前缀、非 uuid、伪造扩展名）、MIME 类别判定四象限、appid 解析、URL 拼装（默认域名/CDN）、文件名清洗。

## 五、依赖与注意事项

* 新增后端依赖：`qcloud-cos-sts`（STS 签发）、`cos-nodejs-sdk-v5`（headObject/deleteObject，仅服务端）。前端工程不引任何依赖。

* 永久密钥只存在于 `backend/.env`（已 gitignore），**不入库、不进文档**；对外只签发 key 级、TTL 受限的临时凭证。

* COS 桶一次性手工配置：**CORS 规则**（AllowedOrigin 含 `http://localhost:9000` 与生产域名；AllowedMethod PUT；AllowedHeader `*`；ExposeHeader 含 ETag）；未来小程序接入需配 uploadFile 域名白名单。

* 大文件（video 500MB）未来直传先按单次 PUT；如需分片断点续传再扩展（STS policy 追加 multipart action）。

* 客户端不执行 register 会产生 COS 孤儿对象，不影响 DB 一致性；后续可加桶生命周期规则。

* register 接口不依赖 user 归属（key 是服务端生成的随机 UUID，且入库前 headObject 权威校验），故表中不设 uploader 列。

## 六、验证

* 数据库：检查 `drizzle/0001_*.sql`（media\_file 表、url 唯一索引、默认值），迁移成功。

* 门禁（backend/）：`bun run typecheck`、`bun run lint`、`bun run test`（含新增 media.test.ts）全绿。

* 浏览器（管理后台 <http://localhost:3000）：>

  1. 侧边栏出现「媒体管理」，非 admin 不可见/不可访问（直接访问 403）；
  2. 列表分页、类型筛选、关键词搜索（URL 与文件名各验一条）生效；
  3. 删除：确认弹窗 → COS 对象被删除（控制台/HEAD 404）→ 列表行消失；
  4. 负向：删除不存在 id → 404。

* 直传链路（用临时 Bun 脚本模拟，测完删除，遵循 AGENTS.md §9）：

  1. 未登录调 credentials → 401；
  2. 登录后 `POST /api/media/credentials`（type=image，contentType=image/jpeg）→ 拿到临时凭证与 key；类别不匹配 → 422；
  3. 用临时凭证 PUT 对象到 COS（200）→ `POST /api/media/register` → 返回行且 metadata 的 size/mimeType 与对象一致；重复 register 幂等返回同一行；伪造 key（`images/../x.jpg`）→ 404；
  4. 该记录随后在后台列表可见并可删除。

## 七、风险与应对

* **COS CORS/密钥未配置**：实施前先配置好桶 CORS 与 `.env`；未配置时接口返回明确「对象存储未配置」错误而非裸异常。

* **STS resource 格式错误**：appid 解析与单 key resource 写法由单测覆盖；STS 错误记日志返回 500，不泄露密钥。

* **伪造 register 写脏数据**：`parseObjectKey` 严格正则 + headObject 权威校验（类别/大小）；bucket/region 只取服务端 env。

* **误删仍被引用的媒体**：删除接口以 ref\_count 为护栏返回 409；当前无业务引用，默认全为 0。

* **删除 COS 对象与删行不一致**：先删对象（404 容忍）再删行；若删行失败，对象已删不产生越权内容，可重试删除接口（此时 head 不存在但行还在——实现上删除接口对“对象不存在但行存在”继续执行删行，保证可重试）。

