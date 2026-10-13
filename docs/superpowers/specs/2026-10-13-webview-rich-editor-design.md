# WebView 富文本编辑器设计

> 日期：2026-10-13
> 状态：已批准，待编写实现计划
> 范围：后端 Nuxt UI UEditor 承载编辑 + 前端 web-view 宿主 + mp-html 只读渲染 + 草稿表中转

## 1. 背景与决策

- 项目已装 `@nuxt/ui@4.11`，自带 `UEditor`（Tiptap 4.3+ 驱动），支持 `v-model` 绑定 HTML/JSON/Markdown。
- 既有基建可复用：`one-time-token` 免登录 + `/sso-login` 落地页 + 前端 [webview/admin/index.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/webview/admin/index.vue) 已跑通小程序 web-view 打开后台页；COS 直传凭证（图片 10MB / 视频 500MB / 音频 50MB）与登记接口齐备。
- 旧 mp-html 编辑器（含 rich-editor + rich-viewer）在 `feature/richtext-editor` 分支，main 上当前无任何消费富文本的业务模块（posts 已删）。

### 已确认决策

| # | 决策 | 选择 |
|---|------|------|
| 1 | 目标端 | **H5 + 微信小程序**（App 端后续单独适配） |
| 2 | 内容通道 | **后端草稿表 + draftId**：URL 只传 ID，编辑器内防抖自动保存，返回时按 ID 拉取最终 HTML |
| 3 | 使用权限 | **所有登录用户**（与媒体上传凭证接口一致） |
| 4 | 交付范围 | **能力 + 渲染 + 演示页**：编辑链路 + 从旧分支移植 rich-viewer 作只读渲染 + 演示页闭环 |

### 平台硬约束

- 微信小程序 `<web-view>` 的 `postMessage` **不是实时通道**：网页发的消息只在小程序后退、组件销毁、分享时才投递给宿主。因此微信端**不承诺逐字实时**，实时性由"编辑器自动保存"保证，宿主取回的永远是最终落稿。
- H5（iframe）可真正实时双向 `postMessage`（同站 Cookie，生产须同注册域名）。
- iOS 微信 web-view 音频文件选择受系统限制，属平台限制而非代码缺陷。

## 2. 总体架构与数据流

```
业务页 ──openRichEditor({initial})──> useRichEditor composable
    ① POST /api/editor/drafts {content}  (alova, Cookie)
    ② navigateTo /pages/webview/editor/index?draftId=xxx
    ▼
前端宿主页（H5: iframe / 微信: <web-view>）
    ③ GET /api/auth/one-time-token/generate
    ④ src = <ADMIN>/sso-login#ott=...&redirect=/rich-editor?draft=xxx
    ▼
后端 /rich-editor 页（ClientOnly UEditor，layout:false）
    ⑤ GET /api/editor/drafts/:id 取初始 HTML
    ⑥ 编辑中：防抖 1s PUT /api/editor/drafts/:id（自动保存）
       H5：同时 window.parent.postMessage({type:'update',html}) 实时同步
    ⑦ 点「完成」：flush 保存
       微信：wx.miniProgram.postMessage({type:'rich-editor:done',draftId}) + navigateBack()
       H5  ：window.parent.postMessage({type:'done',draftId,html})
    ▼
宿主页收到完成 → ⑧ GET /api/editor/drafts/:id 拉最终 HTML（双端统一，以服务端为准）
    → eventChannel.emit('done', {html}) → 业务页预览 rich-viewer 渲染 → ⑨ 可选 DELETE 草稿
```

### 同站部署要求

- H5 开发态 `localhost:9000` 与 `localhost:3000` 同站（same-site 不看端口），Cookie 可随 iframe 发送。
- 生产要求 H5 与后台部署在**同一注册域名下**（如 `h5.example.com` / `admin.example.com`），文档与 .env 示例注明。
- 小程序：生产 HTTPS + 小程序后台「业务域名」；开发工具勾「不校验合法域名」（沿用现有约定）。
- web-view 与小程序**共享同一条 Better Auth session**（任一端退出会同时失效），沿用 ott 插件既有行为。

## 3. 后端改动（backend/）

### 3.1 数据库

新增 `editor_draft` 表（drizzle schema.ts + 生成 `drizzle/0001_editor_draft.sql`）：

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid PK | `crypto.randomUUID()` |
| user_id | uuid → user.id | ON DELETE CASCADE，索引 |
| content | text | 默认 ''，上限 100 万字符（Zod 校验） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

草稿 TTL **7 天**，GET/PUT 命中过期草稿返回 404（惰性清理，不引入定时任务；POST 创建时顺带清理本人过期草稿）。

### 3.2 API（登录用户，统一信封，限流走全局默认）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/editor/drafts | body `{content}`，Zod 校验 string、上限 100 万字符；创建时顺带清理本人过期草稿；返回 `{id, content, updatedAt}` |
| GET | /api/editor/drafts/[id] | 仅属主，返回 `{id, content, updatedAt}`；过期返回 404 |
| PUT | /api/editor/drafts/[id] | 仅属主，`{content}` → `{updatedAt}`；过期返回 404 |
| DELETE | /api/editor/drafts/[id] | 仅属主 |

属主过滤：`draft.user_id === event.context.session.user.id`，不匹配返回 404（不泄漏存在性）。纯逻辑抽到 `server/utils/editor-draft.ts`（TTL 判定、属主过滤、清理本人过期），便于单测。

### 3.3 编辑器页 `app/pages/rich-editor.vue`（新增）

- `definePageMeta({ layout: false })`；`auth.global.ts` 默认要求登录且路径非 /admin，普通用户可达，**无需改守卫**；`resolveSafeRedirect` 已允许任意单斜杠站内路径，`/rich-editor` 合法。
- `<ClientOnly>` 包裹 `UEditor`，`content-type="html"`，移动优先布局：
  - 吸顶工具栏（分组：撤销重做｜段落/标题 H1-H3｜字体｜字号｜加粗/斜体/下划线/删除线｜文字色/背景色｜对齐｜有序/无序列表｜链接｜图片/视频/音频｜清除格式）
  - 选中气泡菜单（Tiptap BubbleMenu，仅基础样式快捷入口）
  - 右上角「完成」、左上「取消」
  - 保存状态文案（保存中/已保存 HH:mm/未保存）
- **Tiptap 扩展**（版本与 `@nuxt/ui@4.11` 内置 tiptap 对齐，实现时先查 node_modules 锁定版本号再装）：
  - `TextAlign`（left/center/right/justify）
  - `TextStyle` + `Color`（文字色，调色板 hex 预设）
  - `Highlight`（multicolor 背景色）
  - `FontFamily`（白名单：系统默认/衬线/等宽，不引中文 webfont）
  - 自定义 `FontSize`（12–36px 预设，输出 inline style `font-size: Npx`）
  - 自定义 **Video 节点**（渲染 `<video controls playsinline>`，含上传中占位）
  - 自定义 **Audio 节点**（渲染 `<audio controls>`，含上传中占位）
  - StarterKit 配置 `link.openOnClick=false`，链接走 popover 输入
- **浏览器直传 COS**（`app/utils/editor-media.ts`）：
  - 复用既有 `POST /api/media/credentials` + PostObject（HMAC-SHA1 签名，新增 `crypto-js` 依赖，与前端 cos-post 同算法）+ `POST /api/media/register`
  - 按 MIME 分流 image/video/audio，上传前做类型与大小预检（10MB/500MB/50MB）
  - 成功后插入节点；width/height（图片/视频）与 duration（音视频）本地读取后随 register 上报
- **桥接 `app/composables/useEditorBridge.ts`**：
  - UA 识别微信 web-view 动态注入 `jweixin-1.3.2.js`
  - H5 用 `window.parent.postMessage`，双向校验 origin（editor 页只接受配置的 H5 origin）
  - 消息协议统一 `{source:'txwx-rich-editor', type, ...}`（type: ready/update/done/cancel/error）
  - 完成时确保 flush 成功再退出
  - 会话失效页（401/票据失效）给"返回重试"

### 3.4 COS CORS 配置

后端编辑器页在浏览器内直接调 `/api/media/credentials` 与 `cos.<region>.myqcloud.com`（PostObject）：
- `/api/media/credentials` 同站（编辑器页与 API 同源），无 CORS 问题。
- PostObject 到 COS：若 COS 未配 CORS，需在腾讯云控制台为 `bucket` 添加 CORS 规则（Origin: 后台域名，Method: POST，Header: *）。文档注明此为生产部署前置条件；开发态 localhost 同源不触发。

## 4. 前端改动（frontend/）

### 4.1 新增宿主页 `src/pages/webview/editor/index.vue`

条件编译双模板：
- H5：全屏原生 `<iframe :src>` + window message 监听（接收 update/done/cancel，校验 origin）
- 微信：`<web-view :src @message>`（message 仅在返回时投递），onLoad 校验登录→生成 ott→拼 `redirect=/rich-editor?draft=<id>`→src 就绪才挂载（沿用 admin 页模式）

### 4.2 新增 composable `src/composables/useRichEditor.ts`

```ts
openRichEditor({ initial?, placeholder? }): Promise<{ html: string } | null>
```
- 建草稿（POST /api/editor/drafts）→ navigateTo → 经 `eventChannel` 接收 done/cancel
- 取消/系统返回（微信无消息）解析为 null
- done 时 GET /api/editor/drafts/:id 拉最终 HTML（以服务端为准）

### 4.3 新增 `src/api/editor.ts`

drafts 四个接口（alova，Cookie，统一信封解包）。

### 4.4 移植只读渲染 `src/components/rich-viewer/`

从 `feature/richtext-editor` 移植：
- `rich-viewer.vue` + `rich-link.ts`（含 `normalizeLinkUrl`，单测 `rich-link.test.ts`）
- vendor 脚本 `scripts/vendor-mp-html.mjs` 重新生成 mp-html 时**裁掉 editable 插件及其全部 H5 补丁**（气泡菜单坐标/图标/换行补丁都不再需要）
- 同步精简：tsconfig exclude、eslint ignore、vite excludeNames、uno safelist
- main.ts 的 `$set/$delete` mixin 移除（仅为 editable 而加）
- App-plus vendor 静态资源本期不移植（不做 App 端）

### 4.5 演示页 `src/pages/richtext/demo.vue`

- 卡片展示当前 HTML + rich-viewer 实时预览 +「编辑内容」按钮走完整闭环
- 入口挂「我的」页（与旧分支一致）

## 5. HTML 内容契约（编辑器输出 ↔ mp-html 渲染兼容）

- **唯一格式 HTML**，标签白名单：`p br h1 h2 h3 blockquote hr ul ol li strong em u s a img video audio span mark`
- **所有样式 inline style**，不依赖任何 class/CSS 文件
- 颜色/字号/字体/对齐均输出为内联 style（颜色 hex、字号 px、TextAlign 走 style 模式）
- 链接强制 `target="_blank" rel="noopener noreferrer"` 且仅放行 http/https/mailto/tel（复用 `normalizeLinkUrl`）
- 媒体 src 为 COS 绝对 https URL
- img/video 样式 `max-width:100%`、audio 全宽
- 渲染端 mp-html 解析器默认剥离 script/事件属性；rich-viewer tag-style 只补媒体宽度与链接色
- **同一份 HTML 两端渲染一致**，作为验收硬标准

## 6. 异常与边界

| 场景 | 处理 |
|------|------|
| 草稿过期（>7 天） | 404，提示返回 |
| 上传失败 | toast 且不插空节点 |
| 自动保存失败 | 重试 3 次并标"未保存"，此时完成按钮阻止退出 |
| 401（会话失效） | "登录失效请重新进入"（ott 一次性，宿主重新生成即可） |
| iOS 微信音频选择受限 | 平台限制，测试用例中注明而非阻断 |
| COS CORS 未配 | 生产部署前置条件，文档注明；开发态 localhost 同源不触发 |

## 7. 测试用例（随代码交付）

### 7.1 自动化测试

**后端 vitest**：
- 草稿 Zod 校验（长度/类型）
- TTL 判定与属主过滤纯函数（抽 `server/utils/editor-draft.ts`）
- 全量 typecheck/lint/test 门禁

**前端 vitest**：
- `normalizeLinkUrl`（移植旧用例）
- 桥消息协议归约函数（done/cancel/update、非法 source/origin 丢弃）
- `useRichEditor` 成功/取消/建草稿失败分支（mock uni 与 api）

### 7.2 手工用例矩阵

| 环境 | 用例 |
|------|------|
| H5 Chrome | 全部样式 + 媒体上传 + 链接 + 列表 + 自动保存断网恢复 + 完成/取消 |
| H5 Safari | 同上（验证 iOS 浏览器） |
| H5 移动端浏览器 | 同上（验证触摸交互） |
| 微信开发者工具 | ott 免登录 + 编辑 + 完成/系统返回 |
| 微信真机 | 音频选择受限注明 + 视频/图片上传 |

每端验证：图片/视频/音频上传插入、全部文本样式与列表/链接、自动保存断网恢复、完成/取消/系统返回、过期票据、渲染一致性对照（编辑器输出 HTML vs rich-viewer 渲染）。

### 7.3 端到端冒烟

执行阶段用浏览器自动化对跑起来的 H5 做端到端冒烟。

## 8. Git 策略与交付物

- 从 `main` 切新分支（如 `feature/webview-rich-editor`）
- 旧分支文件按白名单手工移植（不合流整个分支）
- 不自动 commit
- **最终交付**：
  - 后端：编辑器页 `app/pages/rich-editor.vue`、草稿 API `server/api/editor/drafts/*`、迁移 `drizzle/0001_editor_draft.sql`、媒体工具 `app/utils/editor-media.ts`、桥接 `app/composables/useEditorBridge.ts`
  - 前端：宿主页 `src/pages/webview/editor/index.vue`、composable `src/composables/useRichEditor.ts`、API `src/api/editor.ts`、渲染组件 `src/components/rich-viewer/`、演示页 `src/pages/richtext/demo.vue`、vendor 脚本 `scripts/vendor-mp-html.mjs`
  - 自动化测试与用例清单

## 9. 不做（YAGNI）

- App 端 web-view（plus 桥）适配
- 业务实体表（article/资讯/公告）与列表/详情页
- 草稿定时清理任务（惰性清理足够）
- 中文 webfont 接入
- 服务器代理中转上传（违背直传架构）
- H5 整页跳转编辑器（opener 在移动浏览器不可靠）
- 实时协同编辑（多人同时编辑）
- 编辑历史版本回溯
