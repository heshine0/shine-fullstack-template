# AGENTS.md — 桐乡武协（tongxiangwuxie）

本文件是整个仓库的 AI 协作入口，描述两个**相互独立、非 monorepo** 的工程如何组织、联调与校验。
前端工程另有自己的规范文档（见文末「子工程文档」），本文件只记录跨工程共识与本项目相对模板的偏差。

## 1. 项目概述

| 工程 | 目录 | 定位 | 包管理器（约束） |
|------|------|------|------------------|
| backend | `backend/` | Nuxt 4 全栈：REST API + 管理后台页面（SSR/SPA 混合） | **Bun 1.4.0**（安装与脚本一律用 `bun`） |
| frontend | `frontend/` | unibest（uniapp + Vue3）多端应用，当前以 H5 联调为主 | **Bun 1.4.0 全流程（安装依赖与脚本一律 bun）** |

- 两工程各自拥有 `package.json` / lockfile / 配置，**没有 workspace、没有根 package.json**，不要在根目录执行安装。
- 认证为 **Better Auth Cookie 单通道**：会话凭证是 HttpOnly Cookie，全链路不出现 token/Authorization 头。
- 前端 H5 经 vite 代理同源访问后端：`http://localhost:9000/api/**` → `http://localhost:3000/api/**`。

## 2. 技术栈

**backend**：Nuxt 4.5、Nuxt UI v4.11、Drizzle ORM 0.45（drizzle-kit 0.31）、postgres 驱动、PostgreSQL 18、Better Auth 1.7、Zod 4、Vitest 5、ESLint（@nuxt/eslint）。

**frontend**：unibest 4.4 / uniapp（@dcloudio 3.0 alpha）、Vue 3.4、TypeScript 5.8、Vite 5、UnoCSS、wot-ui v2（@wot-ui/ui）、Pinia 2 + pinia-plugin-persistedstate、alova 3 + @alova/adapter-uniapp、Vitest 3、ESLint（@uni-helper/eslint-config）。

## 3. 目录结构（仅列关键项）

```
tongxiangwuxie/
├─ AGENTS.md                  # 本文件
├─ .gitignore                 # 根仓库忽略规则
├─ backend/
│  ├─ app/                    # Nuxt 应用层：管理后台页面
│  │  ├─ pages/               #   login / dashboard / admin/users / admin/roles
│  │  ├─ layouts/default.vue  #   侧边栏+顶栏（aside 为自定义实现）
│  │  ├─ middleware/auth.global.ts
│  │  └─ composables/useAuth.ts
│  ├─ server/
│  │  ├─ api/                 # 路由处理器（文件即路由）
│  │  │  ├─ auth/[...].ts     #   Better Auth handler 挂载点 /api/auth/**
│  │  │  ├─ admin/users/      #   用户管理（注意 [id]/roles.put.ts 目录嵌套）
│  │  │  ├─ admin/roles/
│  │  │  ├─ me.get.ts  health.get.ts
│  │  ├─ middleware/          # 00.request-id / 05.cors / 10.rate-limit / 20.auth
│  │  ├─ plugins/error.ts     # 统一错误序列化钩子
│  │  ├─ database/
│  │  │  ├─ schema.ts         #   业务表（role / user_role / media_file 等）
│  │  │  ├─ auth-schema.ts    #   Better Auth 的 user/session/account/verification
│  │  │  ├─ client.ts         #   drizzle 客户端（带连接重试）
│  │  │  ├─ repositories/     #   数据访问层（users/roles/media）
│  │  │  └─ seed.ts           #   幂等种子：内置角色 + 初始管理员
│  │  ├─ schemas/             # Zod 入参校验（users/roles/media）
│  │  └─ utils/              # errors/response/pagination/validation/auth/logger/env
│  ├─ drizzle/                # 生成的 SQL 迁移（0000_*.sql）
│  ├─ scripts/migrate.ts      # 迁移执行入口
│  ├─ drizzle.config.ts  nuxt.config.ts  vitest.config.ts
│  └─ .env / .env.example     # .env 不入库
└─ frontend/
   ├─ env/                    # 环境变量目录（非项目根！.env/.env.development/...）
   ├─ pages.config.ts         # 路由事实源（生成物 src/pages.json 不要手改）
   ├─ manifest.config.ts      # 应用清单事实源（生成物 src/manifest.json 不要手改）
   ├─ vite.config.ts          # 含 /api 代理配置（保留前缀、不 rewrite）
   └─ src/
      ├─ http/alova.ts        # ★ 本项目请求层：Cookie 模式、统一响应解包、401 处理
      ├─ http/interceptor.ts  # uni.addInterceptor：拼 URL，不注入 Authorization
      ├─ api/auth.ts          # 登录/登出（Better Auth 原生端点）/ getMe
      ├─ store/auth.ts        # ★ 登录态：只持久化 user，不存 token
      ├─ pages/login/index.vue
      ├─ pages/me/me.vue      # 登录守卫 + 退出
      └─ App.vue              # onLaunch 静默 fetchMe 恢复会话
```

## 4. 环境准备

1. **Bun 1.4.0**（前后端统一：安装依赖与运行脚本一律用 `bun`，实测版本 1.4.0）。
2. **PostgreSQL**：使用本地已有容器（名 `postgres`，镜像 `postgres:18-alpine`），
   连接串 `postgresql://postgres:postgres@127.0.0.1:5432/tongxiangwuxie`。
   **不要新建容器**；库不存在时手动 `CREATE DATABASE tongxiangwuxie;`。
3. 后端配置：`cd backend && copy .env.example .env`（Windows），至少填写：
   - `BETTER_AUTH_SECRET`：≥32 字符随机串（`.env.example` 内附生成命令）；
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`：`db:seed` 创建初始管理员用，**密码至少 8 位**。

## 5. 快速开始

```powershell
# —— 后端（PowerShell 用 ; 分隔，不要用 &&）——
cd backend
bun install
bun run db:generate   # 仅 schema 变更后需要，生成 drizzle/*.sql
bun run db:migrate    # 执行迁移
bun run db:seed       # 幂等：内置 admin/user 角色 + 初始管理员
bun run dev           # http://localhost:3000

# —— 前端（另开终端）——
cd frontend
bun install          # 生成 bun.lock；prepare/predev 钩子会生成 src/manifest.json、src/pages.json
bun run dev:h5       # http://localhost:9000
```

初始管理员账号不写入本文档；它由 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 经 `bun run db:seed` 创建。

## 6. 本地联调架构（重要）

- 后端固定 **3000**，前端 H5 固定 **9000**。
- `frontend/vite.config.ts` 的 devServer 代理：键 `VITE_APP_PROXY_PREFIX`（默认 `/api`）
  → 目标 `VITE_SERVER_BASEURL`（`http://localhost:3000`），`changeOrigin: true`，
  **不做路径 rewrite**（后端路由本身含 `/api` 前缀，含 Better Auth 的 `/api/auth/*`）。
- 开关在 `frontend/env/.env.development`：`VITE_APP_PROXY_ENABLE=true`、`VITE_APP_PROXY_PREFIX=/api`。
- 非 H5 端（小程序/App）没有 vite 代理：`src/http/alova.ts` 用条件编译把 baseURL
  切为 `${VITE_SERVER_BASEURL}/api` 直连（跨域 Cookie 需后端 CORS + 凭证支持）。
- 后端 `server/middleware/05.cors.ts` 仅对 `TRUSTED_ORIGINS` 中的来源回显具体 Origin，
  作为前端直连场景的兜底；主链路（9000 代理同源）不触发跨域。

## 7. 后端开发约定

### 7.1 统一响应格式

- 成功：`{ "code": "OK", "data": ..., "pagination"?: ... }`
- 失败：`{ "code": string, "message": string, "issues"?: [{path, message}] }`
- 错误码（`server/utils/errors.ts` 注册表，HTTP 状态固定）：

| code | HTTP | 触发场景 |
|------|------|----------|
| VALIDATION_ERROR | 422 | Zod 校验失败（带 issues） |
| UNAUTHORIZED | 401 | 未登录 / 会话失效 |
| FORBIDDEN | 403 | 已登录但无权限 / 账号停用 |
| NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 唯一约束冲突（邮箱/角色名重复等） |
| RATE_LIMITED | 429 | 触发限流 |
| INTERNAL_ERROR | 500 | 未预期错误 |

抛错一律用 `createApiError(code, extra?)`；`server/plugins/error.ts` 负责序列化，
非业务 H3Error 按 `STATUS_TO_CODE` 映射，不要在处理器里手写 `setResponseStatus + JSON`。

### 7.2 认证与授权

- 中间件顺序：`00.request-id → 05.cors → 10.rate-limit → 20.auth`。
- 仅拦截 `/api/**`；`/api/health`、`/api/auth/**` 为公开前缀。
- 封禁用户一律 403；`/api/admin/**` 额外要求 **角色名严格等于 `'admin'`**
  （授权判据 `role.name === 'admin'`，角色挂在 user_role 关联表）。
- 限流：进程内固定窗口 60s；全局默认 300/min，敏感端点（登录/注册/发 OTP/管理员建用户）10/min。
  手工测试触发 429 后需等约 65 秒。
- `phoneNumber` 在 Better Auth 1.7 中是**插件**（`better-auth/plugins`），不是顶层配置字段。

### 7.3 数据层

- Drizzle 物理列 `snake_case`、TS 属性 `camelCase`；时间字段统一
  `timestamp({ withTimezone: true })`。
- 管理员建用户走 repository 直接入库 + `hashPassword`（`better-auth/crypto`）；
  自助注册经 Better Auth `databaseHooks.user.create.after` 挂默认 `user` 角色。
- 改表流程：编辑 `schema.ts`/`auth-schema.ts` → `bun run db:generate` → 提交生成的
  `drizzle/*.sql` → `bun run db:migrate`。

### 7.4 Nuxt UI v4 易踩坑（实测）

- `UModal` 默认插槽是触发器；**弹窗正文必须用 `<template #body>`**。
- `UForm` 的 `:schema` 只接受 Zod 等 schema 对象；自定义校验用 `:validate="fn"`
  （调用签名 `props.validate(state)`，返回 `{name, message}[]`），事件用 `@submit`。
- `app/app.vue` 必须用 `<NuxtLayout>` 显式包裹页面，否则布局不渲染。
- SSR 取当前请求源用 `useRequestURL()`（应用层），不要用 h3 的 `getRequestURL(event)`。
- UTable 插槽名为 `${column.id}-cell`，行数据取 `row.original`；UPagination 用
  `v-model:page` + `:total` + `:items-per-page`。

## 8. 前端开发约定（相对 unibest 模板的偏差，务必注意）

1. **认证不是模板默认的 token/双 token 模式**。模板自带 `hermes/api.md`（双 token）
   描述的是旧链路，`src/store/token.ts`、`src/http/http.ts` 等模板双 token 代码已删除；
   以 `src/http/alova.ts` + `src/store/auth.ts` 为唯一事实源：
   - beforeRequest **不注入 Authorization**，会话靠 Cookie（H5 同源自动携带）；
   - responded 解包 `{code:'OK', data}`，`code !== 'OK'` 抛错并 toast；
   - Better Auth 原生端点（`/auth/sign-in/email`、`/auth/sign-out`）成功返回裸数据，
     请求时打 `meta: { rawAuth: true }`；
   - 401 时清登录态并 `reLaunch` 到 `/pages/login/index`；启动静默探测用
     `meta: { skipAuthRedirect: true, toast: false }`（见 `api/auth.ts` 的 `getMe(silent)`）。
2. **生成物不要手改**：`src/pages.json`、`src/manifest.json`、`src/types/*.d.ts`
   由 `pages.config.ts` / `manifest.config.ts` / 构建插件生成；新页面在 `src/pages/`
   下用 `definePage({...})` 声明。
3. 平台差异只用条件编译（`// #ifdef H5`）；样式优先 UnoCSS 原子类。
4. 环境变量放在 `frontend/env/`（vite 的 `envDir` 已指向这里），且必须以 `VITE_` 开头。
5. **组件库用 wot-ui v2（`@wot-ui/ui`），主题已与现有 `themes.scss` 主题体系融合，按以下约定：**
   - `wd-*` 经 `pages.config.ts` 的 easycom 规则自动按需引入，**直接写标签，不要手动 import**；
     不要安装/启用 `@wot-ui/unocss-preset`。
   - 颜色**只走主题变量，不改库源码、不在页面硬编码 wot 色值**：`App.ku.vue` 已挂
     `<wd-config-provider :theme="themeStore.resolvedMode">`，`src/style/themes.scss` 的
     `@mixin wot-bridge-vars` 已把 `--wot-*` 语义 token 桥到 `var(--c-*)`，组件自动跟随
     浅/深 × 品牌。接入新 wot 组件若某变体色差，只在该 mixin 内调档，右侧一律引用 `var(--c-*)`。
   - v2 用 **`variant` 而非 v1 的 `plain` 布尔属性**（写旧属性会被静默忽略）：
     `wd-button` variant = `base|plain|dashed|soft|subtle|text`；
     `wd-tag` variant = `light|dark|plain|dashed|text`（默认即 dark 实心）。
     props/事件以随包源码 `node_modules/@wot-ui/ui/components/wd-*/types.ts` 为准。
   - `tsconfig.json` 的 types **不要加 `@wot-ui/ui/global`**（会令 vue-tsc 转译库内 `.vue`
     源、刷出大量库类型错）；运行时类型由 easycom 解析，不依赖该全局入口。

## 9. Windows / PowerShell 注意事项

- PowerShell 不支持 `&&`，用 `;` 串联命令（`bun run` 的 package.json 脚本内部仍可用
  `&&`，那是 Bun Shell 跨平台解析的，与外层终端无关）。
- bun 把安装/运行进度写到 stderr，会被包成红色 CLIXML/NativeCommandError 噪音，**以退出码为准**。
- 前端安装依赖直接 `bun install` 即可：Bun 默认提升依赖、自动安装 peer（等价 pnpm 的
  shamefully-hoist/auto-install-peers），无需额外 flag；`prepare` 只做 husky 初始化与
  生成物生成，不会再执行 `git init`。CI 或要求严格按锁文件安装时用 `bun install --frozen-lockfile`。
- Bun 全局缓存默认在 `~/.bun/install/cache`；若沙箱环境报缓存目录写入受限，
  在允许访问该目录的终端中执行安装，或设置 `BUN_INSTALL_CACHE_DIR` 到可写目录。
- 诊断 HTTP 不要依赖 `Invoke-RestMethod`（非 2xx 会抛异常）；优先写临时 Bun/mjs
  脚本（fetch + 手动 cookie jar），用完删除。

## 10. 质量门禁（合入前必须全绿）

```powershell
# backend（在 backend/）
bun run typecheck   # nuxt typecheck，期望 0 error
bun run lint        # eslint .，期望 0 problem（可 bunx eslint . --fix）
bun run test        # vitest，工具层单测

# frontend（在 frontend/）
bun run type-check  # vue-tsc --noEmit
bun run lint        # 可 bun run lint:fix 自动修风格问题
bun run test:run    # vitest run
```

前端若未跑过 build，`src/types/async-component.d.ts`、`async-import.d.ts`
不会由 uni 插件生成，type-check 会报 TS2688；`src/types/` 整个目录被 gitignore，
可放置仅含 `export {}` 的占位文件（build 时会被真实内容覆盖）。

## 11. Git 与安全

- Git 仓库在**根目录**（`git init -b main` 已执行），两个子工程都没有独立 `.git`。
- 根 `.gitignore` 忽略：`node_modules/`、构建产物（`.nuxt/.output/dist/unpackage` 等）、
  `*.log`、`uni_modules` 内容（保留 `.gitkeep`），以及**仓库根**的 `.env*`
  （用前导 `/` 锚定，避免误伤需要入库的 `frontend/env/*.env` 无密钥构建配置）。
  `backend/.env` 另由 `backend/.gitignore` 忽略。
- 不要把密钥、连接串口令、初始管理员密码写进任何入库文件或文档；口令只通过
  `backend/.env` 的 `ADMIN_PASSWORD` 等变量注入。
- 不要自动创建 commit；仅在用户明确要求时提交。

## 12. 子工程文档

- frontend 的 unibest 模板规范：`frontend/AGENTS.md` 及其引用的 `frontend/hermes/*.md`
  （SFC 结构、平台条件编译、分包/发布等）；其中**认证/请求章节以本文件 §8 为准**。
- 后端模板自带说明：`backend/README.md`（Nuxt 官方说明，业务约定以本文件 §7 为准）。

## 13. 模板派生：品牌参数化脚本

本仓库作为基础模板派生新项目时，**不要手工全局替换品牌字串**，统一用根目录脚本：

```powershell
bun scripts/init-template.mjs             # 交互式（回车保留默认值）
bun scripts/init-template.mjs --dry-run   # 只预览，不落盘
bun scripts/init-template.mjs --yes `
  --title "某某协会" --slug my-app `
  --uni-appid __UNI__XXX --wx-appid wxXXX --admin-email admin@example.com
```

- 参数：品牌中文名、英文 slug（数据库名/health 服务名）、uni-app 与微信 AppID、管理员邮箱。
- 替换范围是脚本内**白名单文件**（前端 env/pages.config/页面与布局、后端 env 示例/后台页面/
  drizzle.config/health、根 AGENTS.md）；env 按键名幂等赋值、源码做一次性字面量替换。
  `.trae/` 历史文档、lockfile、二进制资产不处理。
- 脚本结束会打印仍需手动处理的清单：应用图标、Android 权限、生产域名、`backend/.env`
  密钥（BETTER_AUTH_SECRET/WECHAT/COS）、slug 变更后的建库与迁移、package.json 元信息、
  LICENSE、git remote。
