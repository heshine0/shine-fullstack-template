# AGENTS.md — backend（Nuxt 4 全栈）

本文件是 `backend/` 工程的 AI 协作规范，记录后端技术栈、目录结构、环境准备、开发约定与质量门禁。

> **仓库结构**：本仓库由两个**相互独立、非 monorepo** 的工程组成（`backend/` 与 `frontend/`），
> 没有 workspace、没有根 `package.json`，**禁止在仓库根目录执行安装**。前端规范见
> [../frontend/AGENTS.md](../frontend/AGENTS.md)。

## 1. 工程定位与技术栈

- 定位：Nuxt 4 全栈 —— REST API + 管理后台页面（SSR/SPA 混合）。
- 包管理器：**Bun 1.4.0**（安装依赖与运行脚本一律用 `bun`，实测版本 1.4.0）。
- 技术栈：Nuxt 4.5、Nuxt UI v4.11、Drizzle ORM 0.45（drizzle-kit 0.31）、postgres 驱动、
  PostgreSQL 18、Better Auth 1.7、Zod 4、Vitest 5、ESLint（@nuxt/eslint）。
- 认证：**Better Auth Cookie 单通道** —— 会话凭证是 HttpOnly Cookie，全链路不出现
  token/Authorization 头。

## 2. 目录结构（仅列关键项）

```
backend/
├─ app/                       # Nuxt 应用层：管理后台页面
│  ├─ pages/                  #   login / dashboard / admin/users / admin/roles
│  ├─ layouts/default.vue     #   侧边栏+顶栏（aside 为自定义实现）
│  ├─ middleware/auth.global.ts
│  └─ composables/useAuth.ts
├─ server/
│  ├─ api/                    # 路由处理器（文件即路由）
│  │  ├─ auth/[...].ts        #   Better Auth handler 挂载点 /api/auth/**
│  │  ├─ admin/users/         #   用户管理（注意 [id]/roles.put.ts 目录嵌套）
│  │  ├─ admin/roles/
│  │  ├─ me.get.ts  health.get.ts
│  ├─ middleware/             # 00.request-id / 05.cors / 10.rate-limit / 20.auth
│  ├─ plugins/error.ts        # 统一错误序列化钩子
│  ├─ database/
│  │  ├─ schema.ts            #   业务表（role / user_role / media_file 等）
│  │  ├─ auth-schema.ts       #   Better Auth 的 user/session/account/verification
│  │  ├─ client.ts            #   drizzle 客户端（带连接重试）
│  │  ├─ repositories/        #   数据访问层（users/roles/media）
│  │  └─ seed.ts              #   幂等种子：内置角色 + 初始管理员
│  ├─ schemas/                # Zod 入参校验（users/roles/media）
│  └─ utils/                  # errors/response/pagination/validation/auth/logger/env
├─ drizzle/                   # 生成的 SQL 迁移（0000_*.sql）
├─ scripts/migrate.ts         # 迁移执行入口
├─ drizzle.config.ts  nuxt.config.ts  vitest.config.ts
└─ .env / .env.example        # .env 不入库
```

## 3. 环境准备

1. **Bun 1.4.0**：安装依赖与运行脚本一律用 `bun`。
2. **PostgreSQL**：使用本地已有容器（名 `postgres`，镜像 `postgres:18-alpine`），
   连接串 `postgresql://postgres:postgres@127.0.0.1:5432/tongxiangwuxie`。
   **不要新建容器**；库不存在时手动 `CREATE DATABASE tongxiangwuxie;`。
3. 后端配置：`copy .env.example .env`（Windows，在 `backend/` 下执行），至少填写：
   - `BETTER_AUTH_SECRET`：≥32 字符随机串（`.env.example` 内附生成命令）；
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`：`db:seed` 创建初始管理员用，**密码至少 8 位**。

## 4. 快速开始

```powershell
# 在 backend/ 下；PowerShell 用 ; 分隔，不要用 &&
bun install
bun run db:generate   # 仅 schema 变更后需要，生成 drizzle/*.sql
bun run db:migrate    # 执行迁移
bun run db:seed       # 幂等：内置 admin/user 角色 + 初始管理员
bun run dev           # http://localhost:3000
```

初始管理员账号不写入文档；它由 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 经 `bun run db:seed` 创建。

前端需另开终端启动（`cd ../frontend; bun run dev:h5`，H5 固定 9000 端口），详见
[../frontend/AGENTS.md](../frontend/AGENTS.md)。

## 5. 本地联调架构（重要）

- 后端固定 **3000**，前端 H5 固定 **9000**。
- 前端 `frontend/vite.config.ts` 的 devServer 代理：键 `VITE_APP_PROXY_PREFIX`（默认 `/api`）
  → 目标 `VITE_SERVER_BASEURL`（`http://localhost:3000`），`changeOrigin: true`，
  **不做路径 rewrite**（后端路由本身含 `/api` 前缀，含 Better Auth 的 `/api/auth/*`）。
  主链路为 9000 代理同源访问，不触发跨域。
- 非 H5 端（小程序/App）没有 vite 代理：前端 `src/http/alova.ts` 用条件编译把 baseURL
  切为 `${VITE_SERVER_BASEURL}/api` 直连（跨域 Cookie 需后端 CORS + 凭证支持）。
- 后端 `server/middleware/05.cors.ts` 仅对 `TRUSTED_ORIGINS` 中的来源回显具体 Origin，
  作为前端直连场景的兜底。

## 6. 开发约定

### 6.1 统一响应格式

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

### 6.2 认证与授权

- 中间件顺序：`00.request-id → 05.cors → 10.rate-limit → 20.auth`。
- 仅拦截 `/api/**`；`/api/health`、`/api/auth/**` 为公开前缀。
- 封禁用户一律 403；`/api/admin/**` 额外要求 **角色名严格等于 `'admin'`**
  （授权判据 `role.name === 'admin'`，角色挂在 user_role 关联表）。
- 限流：进程内固定窗口 60s；全局默认 300/min，敏感端点（登录/注册/发 OTP/管理员建用户）10/min。
  手工测试触发 429 后需等约 65 秒。
- `phoneNumber` 在 Better Auth 1.7 中是**插件**（`better-auth/plugins`），不是顶层配置字段。

### 6.3 数据层

- Drizzle 物理列 `snake_case`、TS 属性 `camelCase`；时间字段统一
  `timestamp({ withTimezone: true })`。
- 管理员建用户走 repository 直接入库 + `hashPassword`（`better-auth/crypto`）；
  自助注册经 Better Auth `databaseHooks.user.create.after` 挂默认 `user` 角色。
- 改表流程：编辑 `schema.ts`/`auth-schema.ts` → `bun run db:generate` → 提交生成的
  `drizzle/*.sql` → `bun run db:migrate`。

### 6.4 Nuxt UI v4 易踩坑（实测）

- `UModal` 默认插槽是触发器；**弹窗正文必须用 `<template #body>`**。
- `UForm` 的 `:schema` 只接受 Zod 等 schema 对象；自定义校验用 `:validate="fn"`
  （调用签名 `props.validate(state)`，返回 `{name, message}[]`），事件用 `@submit`。
- `app/app.vue` 必须用 `<NuxtLayout>` 显式包裹页面，否则布局不渲染。
- SSR 取当前请求源用 `useRequestURL()`（应用层），不要用 h3 的 `getRequestURL(event)`。
- UTable 插槽名为 `${column.id}-cell`，行数据取 `row.original`；UPagination 用
  `v-model:page` + `:total` + `:items-per-page`。

## 7. Windows / PowerShell 注意事项

- PowerShell 不支持 `&&`，用 `;` 串联命令（`bun run` 的 package.json 脚本内部仍可用
  `&&`，那是 Bun Shell 跨平台解析的，与外层终端无关）。
- bun 把安装/运行进度写到 stderr，会被包成红色 CLIXML/NativeCommandError 噪音，**以退出码为准**。
- Bun 全局缓存默认在 `~/.bun/install/cache`；若沙箱环境报缓存目录写入受限，
  在允许访问该目录的终端中执行安装，或设置 `BUN_INSTALL_CACHE_DIR` 到可写目录。
- 诊断 HTTP 不要依赖 `Invoke-RestMethod`（非 2xx 会抛异常）；优先写临时 Bun/mjs
  脚本（fetch + 手动 cookie jar），用完删除。

## 8. 质量门禁（合入前必须全绿）

```powershell
# 在 backend/ 下
bun run typecheck   # nuxt typecheck，期望 0 error
bun run lint        # eslint .，期望 0 problem（可 bunx eslint . --fix）
bun run test        # vitest，工具层单测
```

## 9. Git 与安全

- Git 仓库在**仓库根目录**（`git init -b main` 已执行），本工程没有独立 `.git`。
- 根 `.gitignore` 忽略：`node_modules/`、构建产物（`.nuxt/.output/dist` 等）、`*.log` 等；
  **仓库根**的 `.env*` 被忽略，`backend/.env` 另由 `backend/.gitignore` 忽略。
- 不要把密钥、连接串口令、初始管理员密码写进任何入库文件或文档；口令只通过
  `backend/.env` 的 `ADMIN_PASSWORD` 等变量注入。
- 不要自动创建 commit；仅在用户明确要求时提交。

## 10. 模板派生：品牌参数化脚本（跨工程）

本仓库作为基础模板派生新项目时，**不要手工全局替换品牌字串**，统一用根目录脚本：

```powershell
bun ../scripts/init-template.mjs             # 交互式（回车保留默认值）
bun ../scripts/init-template.mjs --dry-run   # 只预览，不落盘
bun ../scripts/init-template.mjs --yes `
  --title "某某协会" --slug my-app `
  --uni-appid __UNI__XXX --wx-appid wxXXX --admin-email admin@example.com
```

（脚本位于仓库根 `scripts/init-template.mjs`，在仓库根或任一子目录下执行均可，以下路径以仓库根为基准。）

- 参数：品牌中文名、英文 slug（数据库名/health 服务名）、uni-app 与微信 AppID、管理员邮箱。
- 替换范围是脚本内**白名单文件**（前端 env/pages.config/页面与布局、后端 env 示例/后台页面/
  drizzle.config/health、根 AGENTS.md）；env 按键名幂等赋值、源码做一次性字面量替换。
  `.trae/` 历史文档、lockfile、二进制资产不处理。
- 脚本结束会打印仍需手动处理的清单：应用图标、Android 权限、生产域名、`backend/.env`
  密钥（BETTER_AUTH_SECRET/WECHAT/COS）、slug 变更后的建库与迁移、package.json 元信息、
  LICENSE、git remote。

## 11. 参考文档

- [README.md](./README.md)：Nuxt 官方模板说明；**业务约定以本文件 §6 为准**。
