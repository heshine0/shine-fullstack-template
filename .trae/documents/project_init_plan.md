# 项目初始化实施计划（backend + frontend）

## 调研结论

- 工作区 `d:\projects\tongxiangwuxie` 当前为空目录，无现存代码与约束。
- 本机工具链已就绪：开发机用 Bun 1.4.0、Node v24.20.0、pnpm 11.24.0（部署环境以运行平台为准）；本地已有 PostgreSQL 容器 `postgresql://postgres:postgres@127.0.0.1:5432/`，**不新建容器**。
- **backend**：Nuxt 4 采用 `app/`（管理界面）+ `server/`（Nitro RESTful API）结构；Nuxt UI v4 为免费单一包 `@nuxt/ui`（含 Tailwind CSS v4），Starter 极简模板起步。
- **后端数据层**：Drizzle ORM + postgres.js 驱动连接 PostgreSQL；drizzle-kit 管理迁移；Zod 对每个端点的路径参数/查询参数/请求体做严格校验，失败返回结构化错误。本阶段交付**基础设施 + 示例资源 `posts` 端到端 CRUD + 用户授权管理**作为后续业务开发标准模式。
- **认证层**：采用 **Better Auth**（Drizzle adapter），邮箱密码 + 手机号 OTP 登录；**手写** Nuxt 集成（不引入 `nuxt-better-auth-utils`）——自写 `routes/auth/[...].ts` 挂 handler、自写 `server/middleware/auth.ts` 校验会话、自写 `app/composables/useAuth.ts` 提供 SSR-safe session、自写 `app/middleware/auth.global.ts` 页面守卫。
- **会话策略（Cookie 单通道）**：Better Auth `getSession` 仅支持 **Cookie 解析**，不解析 `Authorization: Bearer` 头。统一走 Cookie 通道：
  - **管理后台**：同源（3000），浏览器自动带 Cookie
  - **unibest H5 开发**：`vite.config.ts` 配置 dev proxy，把 `/api` 反向代理到 `http://localhost:3000`，前端调用同源 `http://localhost:9000/api/...`，Cookie 由代理透传（`changeOrigin: true`）
  - **unibest 小程序**：`uni.request` 不持久化 Cookie，需走 `wx.setStorageSync('cookie')` + 每次请求从响应头读 `set-cookie` 拼接（仅 H5 阶段验证，小程序适配留后续）
  - 生产环境 HTTPS + `BETTER_AUTH_URL=https://api.example.com` + Cookie `SameSite=None; Secure`
- **认证配置要点**：`utils/auth.ts` 用 `betterAuth({ baseURL, trustedOrigins:['http://localhost:3000','http://localhost:9000'], database: drizzleAdapter(...), emailAndPassword:{enabled:true, minPasswordLength:8}, phoneNumber:{enabled:true} })`；OTP 走 `verification` 表（Better Auth 自带）。
- **管理后台**：Nuxt UI v4 免费的 `AppShell`/`AppSidebar`/`AppMain` 组件搭 dashboard 布局（侧边栏 + 顶栏 + 内容区），**不引入**付费的 `@nuxt/ui-pro`；页面含登录页、后台首页（dashboard）、用户管理、角色管理。
- **用户授权**：采用**轻量角色模型**（`role` + `user_role` 多对多关联），无独立权限点；授权校验以 `role.name === 'admin'`（中文友好可读）为判据，**避免用 `role.key` 硬编码**（与字段名重名）；`/api/admin/**` 仅 admin 角色可访问；注册默认挂 `user` 角色（数据库 hook）。
- **速率限制**：初始阶段在 login/sign-up/admin/users 创建端点加限流（每分钟 10 次），存储用进程内 LRU（不引入 Redis）；后续抽象为独立中间层。
- **公共基础模块**：统一成功/错误响应 + 全局错误处理器 + 错误码注册表；环境变量 Zod 校验（fail-fast）+ CORS + 结构化日志；种子脚本 + Vitest 测试基础（显式 `import 'dotenv/config'`）；前端 HTTP 请求封装 + 认证状态与路由守卫。
- **frontend**：unibest（Vue3 + Vite + TS + UnoCSS + Pinia 的 uni-app 脚手架）base 模板；用户/会话持久化用 `uni.setStorageSync`（跨 H5/小程序统一接口，**不存 token，token 在 Cookie**）。
- **包管理器（用户已决策）**：backend 使用 Bun；frontend **使用 pnpm 创建/安装依赖、使用 Bun 构建运行**；不建立 monorepo workspace，两个工程相互独立。
- **版本管理**：工作区根目录初始化 git 仓库（脚手架 `gitInit false` 避免嵌套 .git），根级 `.gitignore` 统一忽略；backend 仓库附带 `README.md`、`.editorconfig`。
- 既有经验教训：
  - Windows 非 TTY 下脚手架/`drizzle-kit push` 可能交互卡死——用显式参数；库变更用 **generate + migrate**，不用 `push`。实测：`bun create nuxt@latest` 的 `-t` 旗标会被 bun 误解析，改用 **`bunx create-nuxt@latest <dir> --template ui --no-install --gitInit false`** 可用，受阻时回退 `bunx giget@latest github:nuxt-ui-templates/starter`。
  - HTTP 探活用 PowerShell 原生 `Invoke-WebRequest -Uri`，不用 `curl` 别名；会话维护用 `-SessionVariable`。
  - Drizzle 查询链严格对照当前版本 API，select 字段与 schema 完全一致。
  - Vitest 需在 `vitest.setup.ts` 显式 `import 'dotenv/config'`，并同步配置 tsconfig alias，避免「开发可用、测试不可用」。
  - Better Auth 默认从 Cookie 解析 session，`getSession({ headers })` 不会处理 `Authorization: Bearer` 头——必须走 Cookie 通道。

## 目录与文件

```text
tongxiangwuxie/
├─ .git/  .gitignore                    # 根 git 仓库（node_modules/.env/.nuxt/.output/dist/uni_modules 等）
├─ backend/                             # Nuxt 4 + Nuxt UI v4（Bun）
│  ├─ app/
│  │  ├─ app.vue                        # <UApp> 包裹
│  │  ├─ assets/css/main.css            # tailwindcss + @nuxt/ui
│  │  ├─ composables/useAuth.ts         # SSR-safe session composable
│  │  ├─ middleware/auth.global.ts      # 页面级全局路由守卫：无会话跳 /login（避免与 server middleware 命名混淆）
│  │  ├─ layouts/default.vue            # AppShell 后台布局（侧边栏+顶栏+内容区）
│  │  └─ pages/
│  │     ├─ index.vue                   # 重定向 /dashboard
│  │     ├─ login.vue                   # 登录页（独立布局，不套后台壳）
│  │     ├─ dashboard.vue               # 后台首页
│  │     └─ admin/
│  │        ├─ users.vue                # 用户管理（创建/列表/搜索/启禁用/分配角色）
│  │        └─ roles.vue                # 角色管理（CRUD）
│  ├─ server/
│  │  ├─ api/
│  │  │  ├─ health.get.ts               # 公开：健康检查（不查库）
│  │  │  ├─ me.get.ts                   # 受保护：当前登录用户
│  │  │  ├─ admin/                      # 受保护 + admin 角色
│  │  │  │  ├─ users/index.get.ts       #   用户列表（page/pageSize/keyword）
│  │  │  │  ├─ users/index.post.ts      #   创建用户（含限流，admin 显式分配角色）
│  │  │  │  ├─ users/[id].get.ts        #   用户详情
│  │  │  │  ├─ users/[id].patch.ts      #   启禁用/改资料（含自我保护）
│  │  │  │  ├─ users/[id].delete.ts     #   删除用户（含自我保护）
│  │  │  │  ├─ users/[id].roles.put.ts  #   分配角色（含自我保护，区分注册 hook 与管理员创建）
│  │  │  │  └─ roles/                   #   角色 CRUD
│  │  │  │     ├─ index.get.ts / index.post.ts
│  │  │  │     └─ [id].get.ts / .patch.ts / .delete.ts
│  │  │  ├─ auth/                       # 注册/登录端点（限流，防爆破）
│  │  │  │  ├─ sign-up.post.ts          #   邮箱密码注册
│  │  │  │  ├─ sign-in.post.ts          #   邮箱密码登录
│  │  │  │  └─ ...
│  │  │  └─ posts/                      # 受保护：演示 auth + Zod + repository + 分页
│  │  │     ├─ index.get.ts             #   列表（page/pageSize/keyword）
│  │  │     ├─ index.post.ts            #   创建
│  │  │     └─ [id].get.ts / .put.ts / .delete.ts
│  │  ├─ routes/auth/[...].ts           # Better Auth handler 挂载点（catch-all，setCookie 由 Better Auth 设置）
│  │  ├─ middleware/
│  │  │  ├─ auth.ts                     # 服务端认证中间层：getSession({ headers }) Cookie 解析；/api/admin/** 追加 role.name === 'admin' 校验
│  │  │  ├─ request-id.ts               # 为每个请求注入 requestId
│  │  │  └─ rate-limit.ts               # IP 限流（LRU，每 IP 每分钟 10 次）
│  │  ├─ database/
│  │  │  ├─ client.ts                   # postgres.js + drizzle；初始化时 env 校验；带重试（指数退避，最多 5 次）
│  │  │  ├─ schema.ts                   # posts + auth + role/user_role；timestamp 用 withTimezone
│  │  │  ├─ auth-schema.ts              # Better Auth 迁移表定义
│  │  │  ├─ repositories/
│  │  │  │  ├─ posts.ts                 # 数据访问层
│  │  │  │  ├─ users.ts                 # 用户查询/启禁用/角色关联
│  │  │  │  └─ roles.ts                 # 角色 CRUD + 用户-角色关联
│  │  │  └─ seed.ts                     # 种子脚本：admin+user 角色（中文 name）+ 初始管理员授予 admin
│  │  ├─ utils/
│  │  │  ├─ auth.ts                     # betterAuth 实例（含 password 兜底检查）+ getUserRoles(userId)
│  │  │  ├─ env.ts                      # Zod 校验环境变量（DATABASE_URL/BETTER_AUTH_URL/BETTER_AUTH_SECRET）
│  │  │  ├─ errors.ts                   # 错误码注册表 + createApiError
│  │  │  ├─ response.ts                 # ok()/paginated()
│  │  │  ├─ logger.ts                   # 结构化日志（consola + requestId）
│  │  │  ├─ pagination.ts               # 分页/排序约定 + parsePagination
│  │  │  └─ validation.ts               # Zod parse → 422 结构化错误
│  │  └─ schemas/
│  │     ├─ posts.ts                    # posts 的 params/query/body Zod schema
│  │     ├─ users.ts                    # 用户列表/创建/更新/分配角色 Zod schema
│  │     └─ roles.ts                    # 角色 CRUD Zod schema
│  ├─ drizzle/0000_init.sql             # posts + auth + role/user_role 表一次性迁移
│  ├─ drizzle.config.ts                 # drizzle-kit 配置（读 .env）
│  ├─ vitest.config.ts                  # 测试 alias
│  ├─ vitest.setup.ts                   # import 'dotenv/config'
│  ├─ .env / .env.example               # DATABASE_URL + BETTER_AUTH_URL + BETTER_AUTH_SECRET + ADMIN_*
│  ├─ nuxt.config.ts                    # @nuxt/ui；runtimeConfig 透传；CORS routeRules
│  ├─ README.md                         # 启动/迁移/seed/测试说明
│  ├─ .editorconfig                     # 跨编辑器一致性
│  ├─ package.json                      # +drizzle-orm postgres zod better-auth；dev: drizzle-kit/vitest
│  ├─ bun.lock
│  └─ tsconfig.json
└─ frontend/                            # unibest base（pnpm 创建/安装、Bun 运行）
   ├─ src/
   │  ├─ api/                           # 对接后端：baseURL（同源 '/api'）、401 拦截
   │  ├─ store/auth.ts                  # Pinia：用户/会话信息（持久化用 uni.setStorageSync，不存 token）
   │  ├─ interceptors/                  # unibest 请求/路由拦截
   │  └─ pages/components/hooks/utils/layouts、App.vue、main.ts、pages.config.ts、manifest.config.ts
   ├─ vite.config.ts                    # server.proxy['/api'] = http://localhost:3000 (changeOrigin:true)
   ├─ unocss.config.ts  package.json  pnpm-lock.yaml
```

## 关键设计约定

1. **数据库与迁移**：容器默认 `postgres` 维护库上 `CREATE DATABASE tongxiangwuxie`（已存在跳过）；驱动 `postgres`（postgres.js）+ `drizzle-orm/postgres-js`；连接串经 `runtimeConfig` 注入、不暴露客户端；变更唯一路径 generate → migrate（不用 `push`）；`client.ts` 含连接重试（指数退避，最多 5 次）；schema 时间字段统一 `timestamp({ withTimezone: true })`。
2. **示例 schema**：`posts`（id/title/content/published/created_at/updated_at）；auth 侧 `user`/`session`/`account`/`verification` 四表，`user` 含 `phoneNumber` 与 `phoneNumberVerified`；**角色模型**：`role`（id/name 唯一/description/created_at）+ `user_role`（userId/roleId 联合主键，cascade 删除），授权判据用 `name` 而非 `key`。
3. **数据访问层**：DB 操作只经 `repositories/*`（Drizzle 类型推断）；handler 不直接写查询。
4. **认证层（Better Auth，Cookie 单通道）**：`utils/auth.ts` 用 `betterAuth({ baseURL: env.BETTER_AUTH_URL, trustedOrigins:['http://localhost:3000','http://localhost:9000'], database: drizzleAdapter(...), emailAndPassword:{enabled:true, minPasswordLength:8}, phoneNumber:{enabled:true} })`；OTP 发送/校验通过 `verification` 表（Better Auth 自带）；`routes/auth/[...].ts` 挂 `auth.handler(toWebRequest(event))`；`middleware/auth.ts` 调 `auth.api.getSession({ headers: getRequestHeaders(event) })`（Cookie 透传），无会话抛 401、有会话写入 `event.context.auth`。
5. **校验与错误**：Zod 每端点 `paramsSchema/querySchema/bodySchema`（trim、min/max/email；对象 strict）；`validation.ts` 用 `safeParse`，失败 `createApiError('VALIDATION_ERROR',{issues})`。
6. **统一响应与错误码**
   - 成功：`ok(data)` → `{ code:'OK', data, message? }`；列表：`paginated(data,{page,pageSize,total})` → `{ code:'OK', data, pagination:{page,pageSize,total,totalPages} }`。
   - 错误码注册表 `utils/errors.ts`：`VALIDATION_ERROR(422)`、`UNAUTHORIZED(401)`、`FORBIDDEN(403)`、`NOT_FOUND(404)`、`CONFLICT(409)`、`RATE_LIMITED(429)`、`INTERNAL_ERROR(500)`。
   - Nitro `error` hook 兜底未捕获异常为结构化 500（不透出栈/敏感信息）。
   - 前端对齐：unibest 基准模板基于 alova（+@alova/adapter-uniapp），**无内置业务响应码约定**，默认按 HTTP statusCode 判断；在 `responded` 拦截器按 `code` 拆包/抛错即可。
7. **环境变量校验**：`utils/env.ts` 用 Zod 定义 `envSchema`（`DATABASE_URL` url、`BETTER_AUTH_URL` url、`BETTER_AUTH_SECRET` min 32）；`database/client.ts` 初始化时 `safeParse`，失败抛错 fail-fast。
8. **CORS 与日志**：`nuxt.config.ts` 设 `routeRules['/api/**'].cors = true` 放行 frontend(9000) 开发跨域（Cookie 通道需要 `credentials: true`，仅作 dev proxy 兜底）；`utils/logger.ts` 封装 consola（info/warn/error），`middleware/request-id.ts` 注入 `event.context.requestId`。
9. **分页约定**：`utils/pagination.ts` 提供 `pageQuerySchema`（page≥1、pageSize 1..100，默认 1/20）、`parsePagination(query)` → `{limit,offset,...}`。
10. **种子与测试**：`database/seed.ts` 创建 `admin`（管理员）与 `user`（普通用户）角色，用 better-auth 注册初始管理员（`ADMIN_EMAIL`/`ADMIN_PASSWORD`，min 8 字符）并授予 admin 角色；`vitest.config.ts` 配 alias，`vitest.setup.ts` 显式 `import 'dotenv/config'`；`package.json` 加 `test`/`db:seed` 脚本；单测先覆盖 `validation`/`pagination`/`errors` 等工具层（不依赖 DB）。
11. **速率限制**：`middleware/rate-limit.ts` 进程内 LRU（按 IP key，default 60 次/分钟），对 `auth/sign-in`、`auth/sign-up`、`admin/users` POST 三个端点启用；返回 `RATE_LIMITED(429)`。
12. **用户授权（轻量角色 + 自我保护）**：授权粒度到角色、无独立权限点；`utils/auth.ts` 提供 `getUserRoles(userId)`；`middleware/auth.ts` 对 `/api/admin/**` 在认证后追加 `role.name === 'admin'` 校验，缺失抛 `FORBIDDEN`。**注册默认角色**：better-auth `databaseHooks.user.create.after` 仅在 `source !== 'admin'`（管理员通过 `createUser` API 创建）时挂 `user` 角色；管理员创建走 `auth/admin/users.index.post.ts` 显式分配角色，避免覆盖。**自我保护**：禁止对自身账号禁用/删除/移除 admin 角色，返回 `FORBIDDEN`。
13. **管理后台布局与页面**：`layouts/default.vue` 用 Nuxt UI `AppShell`/`AppSidebar`/`AppMain` 组装（侧边栏菜单：Dashboard/用户管理/角色管理；顶栏：用户信息/登出），内容区承载 `NuxtPage`；`login.vue` 用 `definePageMeta({ layout: false })` 独立布局；`dashboard.vue` 后台首页；`users.vue` 用 `UTable` + 分页 + 搜索 + 创建用户 + 启禁用 + 分配角色；`roles.vue` 角色 CRUD；受保护页面挂 `app/middleware/auth.global.ts` 路由守卫（无会话跳 `/login`）；`app/composables/useAuth.ts` 提供 SSR 预取的 session/user 信号。
14. **前端联调层（Cookie 通道，创建 frontend 后落地）**：基于 unibest 的 alova 请求层（`@alova/adapter-uniapp`）——`vite.config.ts` 的 `server.proxy['/api'] = 'http://localhost:3000'`（`changeOrigin:true`）实现同源；登录调 `/auth/sign-in/email`，响应 `set-cookie` 由浏览器/小程序代理维护；`store/auth.ts`（Pinia）持久化 `user`/`session` 信息（**不存 token**，token 在 Cookie）；`beforeRequest` 不用手动注入 Authorization（Cookie 由代理透传）；`responded` 统一处理后端 `{ code, data, message }`（`code !== 'OK'` 抛业务错误、成功拆包返回 `data`、分页映射 `pagination.total`）；401 清态跳登录；`interceptors` 做页面级登录守卫；持久化使用 `uni.setStorageSync`（跨 H5/小程序统一接口）。

## 实施步骤

1. **创建 backend**：`bunx create-nuxt@latest backend --template ui --no-install --gitInit false`（受阻回退 `bunx giget@latest github:nuxt-ui-templates/starter backend`）；改 `packageManager` 为 bun、删除模板自带的 `pnpm-workspace.yaml`/`pnpm-lock.yaml`；`bun install`（网络异常时清理缓存 `bun pm cache rm` 并 `--registry https://registry.npmmirror.com` 重试；冲突 lockfile 一并清掉）。
2. **装依赖**：`bun add drizzle-orm postgres zod better-auth`；`bun add -d drizzle-kit vitest dotenv`。
3. **建库与配置**：Bun 一次性脚本连维护库 `CREATE DATABASE tongxiangwuxie`（已存在跳过）；写 `.env`/`.env.example`（`DATABASE_URL`、`BETTER_AUTH_URL=http://localhost:3000`、`BETTER_AUTH_SECRET`（随机 ≥32 字符）、`ADMIN_EMAIL`/`ADMIN_PASSWORD`）；`nuxt.config.ts` 的 `runtimeConfig` 透传 + CORS `routeRules`；`.gitignore` 忽略 `.env`。
4. **公共基础设施**：`utils/errors.ts`、`utils/response.ts`、`utils/env.ts`、`utils/logger.ts`、`utils/pagination.ts`、`utils/validation.ts`、`middleware/request-id.ts`、`middleware/rate-limit.ts`；Nitro 错误兜底 hook。
5. **数据层**：`drizzle.config.ts`、`schema.ts`（posts + auth + role/user_role，时间字段 `withTimezone`）、`client.ts`（含重试）、`repositories/{posts,users,roles}.ts`。
6. **认证与授权**：`utils/auth.ts`（betterAuth：baseURL + trustedOrigins + `minPasswordLength:8` + `databaseHooks.user.create.after` 仅在非 admin 路径挂默认 `user` 角色 + `getUserRoles`）、`routes/auth/[...].ts`、`middleware/auth.ts`（Cookie 会话解析 + `/api/admin/**` 的 `role.name === 'admin'` 校验）。
7. **迁移与种子**：`bun run db:generate` → `bun run db:migrate`；查询 `information_schema` 确认 posts、4 张 auth 表、role、user_role；`bun run db:seed` 创建 admin/user 角色（中文 name）+ 初始管理员（授予 admin）。
8. **API 端点**：`auth/sign-up.post.ts`、`auth/sign-in.post.ts`（均限流）；`health.get.ts`（公开）、`me.get.ts`（受保护）；posts CRUD；admin/users（**POST 创建** + 列表/详情/启禁用/删除/分配角色，均含自我保护 + 限流）+ admin/roles（CRUD），均受保护 + admin 角色。
9. **单测**：`vitest.config.ts` + `vitest.setup.ts`（`import 'dotenv/config'`）+ `utils/*.test.ts`（validation/pagination/errors），`bun run test` 通过。
10. **管理后台界面**：`layouts/default.vue`（AppShell 后台壳）、`app/middleware/auth.global.ts`（路由守卫，无会话跳 `/login`）、`app/composables/useAuth.ts`（SSR-safe session）、`pages/login.vue`、`pages/dashboard.vue`、`pages/admin/users.vue`、`pages/admin/roles.vue`；`index.vue` 重定向 `/dashboard`；backend 根写 `README.md`、`.editorconfig`。
11. **端到端验证 backend**（`Invoke-WebRequest -SessionVariable` + 浏览器）：访问 `http://localhost:3000/` 200、`/api/health` 200；无凭据访问受保护端点 401；注册/登录取 Cookie 会话；普通用户访问 `/api/admin/**` 403、admin 200；admin 创建用户/分配角色/启禁用/删除全通，**自我禁用/删除/摘除自身 admin 角色被拒 403**；非法 body 422 含 `issues`；不存在 id 404；429 限流验证；响应统一带 `code`；浏览器访问 `http://localhost:3000/login` 渲染、登录访问 `http://localhost:3000/dashboard`、`http://localhost:3000/admin/users`、`http://localhost:3000/admin/roles` 正常渲染。验证后停止 dev。
12. **创建 frontend（pnpm 创建、Bun 运行）**：`pnpm create unibest@latest frontend -t base`（先查 `--help`）；交互阻塞回退 `pnpm dlx degit unibest-tech/unibest#base frontend`，再不行 gitee 镜像；`pnpm install` 安装依赖（生成 pnpm-lock.yaml 与 manifest.json）；日常构建/运行改用 `bun run dev:h5` / `bun run build:h5`，并确保 scripts 内不硬编码 pnpm。
13. **前端联调层**：alova 配置 `baseURL: '/api'`；`vite.config.ts` 配置 `server.proxy['/api'] = 'http://localhost:3000'`（changeOrigin:true）；`store/auth.ts` 用 `uni.setStorageSync` 持久化 user/session 信息；`beforeRequest` 不注入 Authorization（Cookie 由代理透传）；`responded` 统一拆包/抛错 + 401 清态跳登录；`interceptors` 做页面级登录守卫。
14. **验证 frontend**：`bun run dev:h5`（默认 9000）→ `http://127.0.0.1:9000/` 200；登录后通过 dev proxy 调通后端接口、Cookie 正确透传、403/422 错误码响应正确；停止 dev。
15. **根 git 仓库**：工作区根 `git init -b main` + 根 `.gitignore`（node_modules/.env/.nuxt/.output/dist/uni_modules/unibest 生成物等）；不自动提交，交由用户决定。
16. 汇总启动/迁移/seed/测试命令与端口，向用户交付。

## 依赖与注意事项

- Nuxt 4 要求 Node 22+（当前 24 满足）；backend 用 Bun（bun.lock），frontend 用 pnpm 安装依赖（pnpm-lock.yaml）、用 Bun 构建运行。
- Drizzle 与 Better Auth 以安装时最新稳定版为准；Better Auth 的 drizzle adapter 需与 drizzle-orm 版本兼容，冲突则对齐版本。
- `.env` 含数据库口令、`BETTER_AUTH_SECRET`、管理员口令，不提交，只提交 `.env.example`。
- 认证首期范围：后台邮箱密码（minPasswordLength=8）+ 手机号 OTP 登录（phoneNumber）；微信登录仅预留 OAuth provider/回调占位。
- 会话单通道（Cookie）；H7 dev proxy 同源、生产 HTTPS + `SameSite=None; Secure`；小程序 Cookie 适配留后续。
- 授权用轻量角色模型（role + user_role），判据 `role.name`；如后续需要细粒度权限再演进为 RBAC + permission 表。
- frontend 的 `pages.json`/`manifest.json` 为自动生成物，提交与否由用户决定；先 install 生成 manifest 再跑 dev，本次只验证 H5。
- 两端端口 3000 / 9000 可并行；unibest 业务页面开发、跨工程共享 DTO 类型、Git 提交规范、CI/CD·Docker、邮件 SMTP、API 文档(OpenAPI)、微信登录 均为后续工作（不在本次初始化）。

## 验证标准

- backend 以 Bun 安装成功（bun.lock）；frontend 以 pnpm 安装成功（pnpm-lock.yaml）、用 bun run 构建运行正常。
- tongxiangwuxie 库存在；posts、user/session/account/verification、role、user_role 表经迁移创建；`db:seed` 生成 admin/user 角色（中文 name）+ 初始管理员（授予 admin 角色）。
- backend：认证中间层生效（无凭据 401）；Cookie 会话访问受保护端点通过；普通用户访问 `/api/admin/**` 403、admin 200；admin 创建用户成功且新注册用户默认挂 `user` 角色、管理员创建走显式分配；自我禁用/删除/摘除自身 admin 角色被拒；posts 与 admin/users、admin/roles CRUD 正常；统一响应含 `code`；422 含结构化 `issues`；404 正确；429 限流正确；缺环境变量时启动 fail-fast；`bun run test` 通过。
- 管理后台：登录后 `http://localhost:3000/dashboard`、`/admin/users`、`/admin/roles` 页面正常渲染（AppShell 布局 + UTable + 分页）。
- frontend：H5 首页 200；通过 dev proxy 同源 Cookie 通道登录并调通后端接口。
- 工作区根 `.git` 存在且根 `.gitignore` 生效（`git status` 不含 node_modules/.env）。
- 所有 dev/临时进程验证后停止；不残留后台进程。

## 风险与应对

- **脚手架/迁移命令交互卡死**：先查 `--help`；模板回退 giget/degit；库变更只用 generate+migrate；`bun create` 的 `-t` 会被 bun 误解析，改用 `bunx create-nuxt`。
- **bun install 完整性/版本解析失败 / lockfile 冲突**：清理缓存 `bun pm cache rm`、删除冲突 lockfile 后 `--registry https://registry.npmmirror.com` 重试。
- **建库权限或库已存在**：postgres 超管账号建库；捕获 `duplicate_database` 视为成功。
- **Better Auth × Drizzle 版本不兼容**：以官方文档/该版本适配器为准；冲突对齐 drizzle-orm 版本，必要时 `@better-auth/cli` 生成匹配 schema。
- **Better Auth 默认从 Cookie 解析 session**：禁止尝试用 `Authorization: Bearer`；跨域必须 dev proxy 同源或生产 HTTPS；前端**不**手动注入 Authorization。
- **跨域 Cookie 预检失败**：`routeRules` CORS 需 `credentials: true` 并放行 Cookie/Authorization 头；必要时显式配置 `access-control-allow-credentials`。
- **会话 cookie 传递**：`Invoke-WebRequest -SessionVariable` 维护会话；middleware 用 `getRequestHeaders(event)` 传 headers 给 `getSession`。
- **数据库启动未就绪**：`client.ts` 内置重试（指数退避，最多 5 次）。
- **管理员自锁**：自我保护校验（禁用/删除/摘除自身 admin 角色 → 403），seed 默认管理员口令 min 8。
- **Better Auth `databaseHooks` 在管理员 `createUser` 时也会触发**：用 `source !== 'admin'`（或 better-auth 对应区分字段）判断，避免覆盖管理员显式分配。
- **Nuxt UI v4 AppShell 组件 API 差异**：以安装版本文档为准核对 `AppShell`/`AppSidebar` 组件名与插槽，若免费版缺组件则用 `UContainer`/手写 flex 布局兜底。
- **unibest 用 Bun 运行的兼容性**：安装走 pnpm（官方链路，规避兼容问题）；`bun run` 仅执行 scripts，需确保 scripts 内不硬编码 pnpm，必要时改写为 Bun 等价。
- **网络问题**：Bun 临时 `--registry https://registry.npmmirror.com`；unibest 回退 gitee 镜像。
- **端口占用**：`PORT` 环境变量（Nuxt）/ unibest dev 端口参数临时换端口。