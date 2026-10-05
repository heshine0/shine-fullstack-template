# 通用媒体上传组件（后端管理端 + 前端 uniapp）实施计划

> 日期：2026-10-05
> 范围：前后端**各新增一个**上传组件，组件根据 `type` 参数（`image | video | audio | file`）呈现不同 UI；
> 复用已上线的后端通用媒体接口（`POST /api/media/credentials`、`POST /api/media/register`）。
> 组件设计稿（已画出，用户已查看）：image=缩略图网格；video=16:9 播放器；audio=播放条；file=文件列表行。
>
> **修订（v2，依用户反馈）**：前端 uniapp 组件底层**统一使用原生 `uni.uploadFile`**，不引入 cos-js-sdk-v5。
> 因 `uni.uploadFile` 只能发 multipart POST，直传 COS 改用 **PostObject（POST 表单签名）**：
> 后端 STS 策略在现有 PutObject 之外**增加 PostObject 授权**；前端用临时凭证构造 policy/HMAC-SHA1 签名字段。
> （方案已经用户确认：直传 COS PostObject，不走后端中转。）

## 1. 目标与非目标

### 目标
1. 后端管理端（Nuxt 4 应用层）新增 `MediaUploader` 组件：鼠标交互，支持点击 + 拖拽，XHR 直传（PUT，带进度）。
2. 前端 uniapp 新增同构 `media-uploader` 组件：底层**统一原生 `uni.uploadFile`**，以 **PostObject** 方式直传 COS（带进度）；H5 用隐藏 `<input>` 选文件、微信小程序用 `uni.chooseMedia` / `uni.chooseMessageFile`。
3. 两端 props/事件契约保持一致，随 `type` 切换展示形态；单传/多传可配。
4. 补齐前端缺失的媒体 API 层 `src/api/media.ts`、PostObject 签名工具与 TS 类型。
5. 后端 STS 工具最小改动：key 级授权增加 `name/cos:PostObject`（PutObject 保留，兼容未来其他调用方）。

### 非目标
- 不新增业务接口、不做后端中转上传（大文件不经过 Nuxt）。
- 不迁移头像、不接入任何业务页面（本次只交付组件本身；用临时验证页挂载，验证后删除）。
- 不做 App 端适配（仅 H5 + 微信小程序）。
- 不做分片上传/断点续传（500MB 视频以内用单次 PostObject）。

## 2. 统一组件契约（两端一致）

Props：

| 名称 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `type` | `'image' \| 'video' \| 'audio' \| 'file'` | — 必填 | 决定可选文件类别、accept、展示形态 |
| `modelValue` | `MediaItem[]` | `[]` | v-model；单传时长度 ≤1 |
| `multiple` | `boolean` | `false` | 是否多传 |
| `maxCount` | `number` | `multiple ? 9 : 1` | 多传上限 |
| `disabled` | `boolean` | `false` | 禁用选择/删除 |

事件：`update:modelValue`、`change(items)`。

数据项（与后端 `MediaFileRow` 对齐，增加前端上传态）：

```ts
interface MediaItem {
  id: string                 // 登记成功后为 media_file.id；上传中为本地临时 id
  url: string
  type: MediaType
  metadata: MediaMetadata
  status?: 'uploading' | 'done' | 'error'
  progress?: number          // 0~100
}
```

前端上传编排（uni.uploadFile + PostObject）：

1. 本地校验：`type` 与文件 MIME 粗匹配（accept + MIME）、大小按 10/500/50/50MB 预校验（超限直接 toast，不发请求）。
2. `POST /api/media/credentials`，body `{ type, contentType, size, filename }`
   → `{ credential:{tmpSecretId,tmpSecretKey,sessionToken,startTime,expiredTime}, bucket, region, key, url }`。
3. 用临时凭证构造 PostObject 签名表单（见 §4.2），调用 `uni.uploadFile`：
   - URL 为**绝对地址** `https://<bucket>.cos.<region>.myqcloud.com/`（小程序无 vite 代理；H5 上传 COS 也不走代理，依赖桶 CORS）；
   - `formData` 携带 key/policy/签名/安全令牌/`success_action_status=200`；
   - `task.onProgressUpdate` 更新 `progress`。
4. 期望状态码 200（由 success_action_status 指定）；响应解析包 try/catch，非 2xx 置 `error` 并保留原始片段便于排查。
5. `POST /api/media/register`，body `{ key, metadata: { name, width?, height?, duration? } }` → 用返回行替换临时项；register 按 url 幂等。

展示属性探测：图片 `uni.getImageInfo`/chooseMedia 回调拿 `width/height`；视频 chooseMedia 含 `duration`；H5 input 选入的媒体探测失败不阻断（字段可选）。

## 3. 后端管理端组件

文件：`backend/app/components/MediaUploader.vue`（Nuxt 自动导入为 `<MediaUploader>`）。

实现要点：
- 仅客户端交互；隐藏 `<input type="file" :accept :multiple>`，点击触发区 = click input。
- 拖拽：触发区 `dragover`（阻止默认+高亮）、`dragleave`、`drop`（取 `dataTransfer.files`）。
- 选完文件先插入 `status:'uploading'` 临时项；用 **XMLHttpRequest PUT** 直传（浏览器场景保留 PUT，无需 POST 签名）：
  `xhr.open('PUT', url)`；`xhr.upload.onprogress` → `progress`；`xhr.send(file)`；非 2xx 置 `error`。
- 接口调用用 `$fetch('/api/media/credentials', { method:'POST', body })`（同源 Cookie 自动携带）。
- 删除仅移除前端状态（不调 admin 删除接口；服务端删除统一归媒体管理页）。
- 分类型 UI（与设计稿一致，Nuxt UI v4 + Tailwind 原子类）：
  - **image**：空态虚框「点击/拖拽上传图片，jpg/png/webp/gif ≤10MB」；4:3 缩略图网格，角标删除；上传中遮罩百分比+进度条；完成态点击缩略图用 `UModal`（**正文必须 `#body`**）预览大图。
  - **video**：空态虚框「mp4/mov/webm ≤500MB」；16:9 `<video :src controls>` + 「文件名 · 大小 · 时长」。
  - **audio**：空态虚框「mp3/wav/m4a ≤50MB」；`<audio :src controls>` 播放条 + 文件信息（波形首版不实现）。
  - **file**：空态虚框「pdf/doc/xls/zip ≤50MB」；文件行：类型图标 + 名称/大小 + 删除按钮（`i-lucide-trash-2` ghost）。
- accept/文案/上限集中为组件内 `TYPE_UI` 映射。

## 4. 前端 uniapp 组件

### 4.1 新增 API 层
文件：`frontend/src/api/media.ts`
- TS 类型：`MediaType`、`MediaMetadata`、`MediaFileRow`、`ScopedCredential`、`UploadCredentialResult`（与后端字段对齐）。
- `getMediaCredential(body)`：`http.Post('/media/credentials', body)`（拦截器解包、Cookie 模式）。
- `registerMedia(body)`：`http.Post('/media/register', body)`。

### 4.2 PostObject 签名工具
文件：`frontend/src/utils/cos-post.ts`
- 新增依赖：**`crypto-js`**（纯 JS，H5/微信小程序通用，提供 HmacSHA1 与 Base64）；
  安装：`pnpm add crypto-js --ignore-scripts`（frontend/，遵循 AGENTS §9）。
- `buildPostFormFields(credential, bucket, key)` 返回 `Record<string,string>`：

  ```ts
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
  const policyB64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(policy)))
  const signKey = CryptoJS.HmacSHA1(keyTime, credential.tmpSecretKey).toString()
  const signature = CryptoJS.HmacSHA1(policyB64, signKey).toString()
  return {
    key,
    policy: policyB64,
    'q-sign-algorithm': 'sha1',
    'q-ak': credential.tmpSecretId,
    'q-key-time': keyTime,
    'q-signature': signature,
    'q-security-token': credential.sessionToken,   // 临时凭证必带；实现时对照腾讯云 PostObject 官方文档复核字段名
    success_action_status: '200'
  }
  ```

### 4.3 组件文件
`frontend/src/components/media-uploader/media-uploader.vue`（easycom 自动可用 `<media-uploader>`）。

选文件（按 type 分，条件编译）：
- image：`uni.chooseMedia({ count, mediaType:['image'], sourceType:['album','camera'] })`（含 width/height/size）；
- video：`uni.chooseMedia({ mediaType:['video'], maxDuration:60 })`（含 duration）；
- audio：H5 隐藏 input `accept="audio/*"`；MP 用 `uni.chooseMessageFile({ count, type:'file', extension:['mp3','m4a','wav'] })`；
- file：H5 隐藏 input（accept 按类型映射）；MP 用 `uni.chooseMessageFile({ type:'file' })`。
- H5 只有一个隐藏 input，按当前 type 动态 accept；change 后清空 value 以便重选同一文件。

uni.uploadFile 平台分支：

```ts
const fields = buildPostFormFields(cred.credential, cred.bucket, cred.key)
const base = `https://${cred.bucket}.cos.${cred.region}.myqcloud.com`
// #ifdef H5
const task = uni.uploadFile({
  url: base, name: 'file',
  files: [{ name: 'file', file: h5File }],   // H5 用 files 传 File/Blob，不支持 filePath
  formData: fields
})
// #endif
// #ifdef MP-WEIXIN
const task = uni.uploadFile({
  url: base, name: 'file',
  filePath: tempFilePath,                     // 小程序用 chooseMedia/chooseMessageFile 的临时路径
  formData: fields
})
// #endif
task.onProgressUpdate?.(e => updateProgress(e.progress))
```

UI 与设计稿一致，UnoCSS 原子类；无拖拽；上传中显示百分比+进度条；error 态可重试（重新走编排）。accept 后缀/文案/上限集中为 `TYPE_UI`。

## 5. 后端 STS 改动（唯一 server 变更）

文件：`backend/server/utils/cos-sts.ts`

- 策略 action 由单个字符串改为数组（resource 不变，仍为单个 key）：

  ```ts
  action: ['name/cos:PutObject', 'name/cos:PostObject'],
  ```

- 注释更新为「PutObject（浏览器端）/ PostObject（uni.uploadFile 表单）」。
- credentials 接口与响应结构不变。

## 6. 桶 CORS 增补项（用户在 COS 控制台配置）

在既有规则基础上：
- AllowedMethod 增加 **POST**（现有 PUT 保留）；
- AllowedOrigin：`http://localhost:9000`、`http://localhost:3000`（管理端浏览器直传）与生产域名；
- AllowedHeader `*`；ExposeHeader 含 `ETag`。

## 7. 验证方案

临时验证页（验证后删除，不交付）：
- 后端：`backend/app/pages/dev/uploader.vue`，挂四个 `<MediaUploader type=...>` + 一个多传 image；http://localhost:3000/dev/uploader。
- 前端：`frontend/src/pages/dev-uploader/index.vue`（`definePage`）；http://localhost:9000/#/pages/dev-uploader/index。

COS 未配置时：
- 四种触发区文案/accept 正确；选文件 → uploading 项；credentials 500「对象存储未配置」→ error 态；超限 toast 不发请求。
- 预置假行验证缩略图/播放器/文件行渲染与删除交互。

配置真实 COS 后：
- image 单传/多传：进度走完 → register 行返回 → 缩略图/预览正常；同文件重传幂等。
- video/audio：duration 写入 metadata、可播放；file：文件行正确。
- 重点核验 PostObject 签名：如签名失败（403/政策错误），对照腾讯云 PostObject 官方文档校准 policy conditions 与 `q-security-token` 字段。
- 微信小程序：开发者工具验证 chooseMedia/chooseMessageFile + uploadFile 全链路（H5 通过后进行）。

门禁（全绿）：
- backend/：`bun run typecheck`、`bun run lint`、`bun run test`（无新增纯函数则维持 61）。
- frontend/：`bun run type-check`（AGENTS §10 types 占位）、`bun run lint`、`bun run test:run`。
- 删除两个临时页面后再跑一次门禁。

## 8. 文件清单

新增（交付）：
- `backend/app/components/MediaUploader.vue`
- `frontend/src/api/media.ts`
- `frontend/src/utils/cos-post.ts`
- `frontend/src/components/media-uploader/media-uploader.vue`

修改：
- `backend/server/utils/cos-sts.ts`（action 增加 PostObject）
- `frontend/package.json` / lockfile（+ crypto-js；**不**引入 cos-js-sdk-v5）

临时（验证后删除）：
- `backend/app/pages/dev/uploader.vue`
- `frontend/src/pages/dev-uploader/index.vue`

## 9. 风险与注意

1. **签名字段准确性**：PostObject policy 结构与安全令牌表单字段名需在实现/联调时对照腾讯云官方 PostObject 文档复核；先用 cos-js-sdk-v5 官方实现的字段约定（q-sign-algorithm/q-ak/q-key-time/q-signature/q-security-token/policy）。
2. **COS 未配置**：先交付 UI 与错误态，真实链路待 .env + CORS（含 POST）后验证。
3. **uploadFile 平台差异**：H5 必须用 `files:[{name,file}]`，小程序必须用 `filePath`；条件编译隔离；URL 必须绝对地址。
4. **响应解析**：success 回调里 `JSON.parse(res.data)` 包 try/catch，非 2xx/解析失败按失败处理并保留原始片段。
5. **小程序 audio 选择器**：仅 chooseMessageFile，体验受限，首版如实提供。
6. **组件内删除**：只移除前端状态，不删服务端对象。
