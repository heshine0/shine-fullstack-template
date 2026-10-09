# AGENTS.md — frontend（unibest / uniapp 多端应用）

本文件是 `frontend/` 工程的 AI 协作规范：**第一部分为本项目（桐乡武协）相对模板的约定与偏差**，
**第二部分为 unibest 模板自带规范索引（Hermes）**；两者冲突时以第一部分为准。

> **仓库结构**：本仓库由两个**相互独立、非 monorepo** 的工程组成（`backend/` 与 `frontend/`），
> 没有 workspace、没有根 `package.json`，**禁止在仓库根目录执行安装**。后端规范见
> [../backend/AGENTS.md](../backend/AGENTS.md)。

# 第一部分：本项目约定

## 1. 工程定位与技术栈

- 定位：unibest（uniapp + Vue3）多端应用，当前以 H5 联调为主。
- 包管理器：**Bun 1.4.0 全流程**（安装依赖与脚本一律 `bun`，禁止再用 pnpm/npm）。
- 技术栈：unibest 4.4 / uniapp（@dcloudio 3.0 alpha）、Vue 3.4、TypeScript 5.8、Vite 5、
  UnoCSS、Pinia 2 + pinia-plugin-persistedstate、alova 3 + @alova/adapter-uniapp、
  Vitest 3、ESLint（@uni-helper/eslint-config）。
- 认证：**Better Auth Cookie 单通道** —— 会话凭证是 HttpOnly Cookie，全链路不出现
  token/Authorization 头。

## 2. 目录结构（仅列关键项）

```
frontend/
├─ env/                       # 环境变量目录（非项目根！.env/.env.development/...）
├─ pages.config.ts            # 路由事实源（生成物 src/pages.json 不要手改）
├─ manifest.config.ts         # 应用清单事实源（生成物 src/manifest.json 不要手改）
├─ vite.config.ts             # 含 /api 代理配置（保留前缀、不 rewrite）
└─ src/
   ├─ http/alova.ts           # ★ 本项目请求层：Cookie 模式、统一响应解包、401 处理
   ├─ http/interceptor.ts     # uni.addInterceptor：拼 URL，不注入 Authorization
   ├─ api/auth.ts             # 登录/登出（Better Auth 原生端点）/ getMe
   ├─ store/auth.ts           # ★ 登录态：只持久化 user，不存 token
   ├─ pages/login/index.vue
   ├─ pages/me/me.vue         # 登录守卫 + 退出
   └─ App.vue                 # onLaunch 静默 fetchMe 恢复会话
```

## 3. 环境准备与快速开始

- **Bun 1.4.0**：安装依赖与运行脚本一律用 `bun`。
- 环境变量放在 `frontend/env/`（vite 的 `envDir` 已指向这里，**不是项目根**），且必须以
  `VITE_` 开头。无密钥的构建配置（`frontend/env/*.env`）需要入库。
- 前端依赖后端 API：先按 [../backend/AGENTS.md](../backend/AGENTS.md) 启动后端（端口 3000）。

```powershell
# 在 frontend/ 下；PowerShell 用 ; 分隔，不要用 &&
bun install          # 生成 bun.lock；prepare/predev 钩子会生成 src/manifest.json、src/pages.json
bun run dev:h5       # http://localhost:9000
```

## 4. 本地联调架构（重要）

- 后端固定 **3000**，前端 H5 固定 **9000**。
- `vite.config.ts` 的 devServer 代理：键 `VITE_APP_PROXY_PREFIX`（默认 `/api`）
  → 目标 `VITE_SERVER_BASEURL`（`http://localhost:3000`），`changeOrigin: true`，
  **不做路径 rewrite**（后端路由本身含 `/api` 前缀，含 Better Auth 的 `/api/auth/*`）。
- 开关在 `env/.env.development`：`VITE_APP_PROXY_ENABLE=true`、`VITE_APP_PROXY_PREFIX=/api`。
- 非 H5 端（小程序/App）没有 vite 代理：`src/http/alova.ts` 用条件编译把 baseURL
  切为 `${VITE_SERVER_BASEURL}/api` 直连（跨域 Cookie 需后端 CORS + 凭证支持）。
- H5 浏览器登录验证必须落在标准端口 **9000**：Better Auth 自带 trusted-origin 校验；
  dev 跑在 9001 等非标准端口时，POST `/api/auth/sign-in/email` 会带非预期 Origin 被 403。

## 5. 本项目开发约定（相对 unibest 模板的偏差，务必注意）

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

## 6. Windows / PowerShell 注意事项

- PowerShell 不支持 `&&`，用 `;` 串联命令（`bun run` 的 package.json 脚本内部仍可用
  `&&`，那是 Bun Shell 跨平台解析的，与外层终端无关）。
- bun 把安装/运行进度写到 stderr，会被包成红色 CLIXML/NativeCommandError 噪音，**以退出码为准**。
- 安装依赖直接 `bun install` 即可：Bun 默认提升依赖、自动安装 peer（等价 pnpm 的
  shamefully-hoist/auto-install-peers），无需额外 flag；`prepare` 只做 husky 初始化与
  生成物生成，不会再执行 `git init`。CI 或要求严格按锁文件安装时用 `bun install --frozen-lockfile`。
- Bun 全局缓存默认在 `~/.bun/install/cache`；若沙箱环境报缓存目录写入受限，
  在允许访问该目录的终端中执行安装，或设置 `BUN_INSTALL_CACHE_DIR` 到可写目录。

## 7. 质量门禁（合入前必须全绿）

```powershell
# 在 frontend/ 下
bun run type-check  # vue-tsc --noEmit
bun run lint        # 可 bun run lint:fix 自动修风格问题
bun run test:run    # vitest run
```

前端若未跑过 build，`src/types/async-component.d.ts`、`async-import.d.ts`
不会由 uni 插件生成，type-check 会报 TS2688；`src/types/` 整个目录被 gitignore，
可放置仅含 `export {}` 的占位文件（build 时会被真实内容覆盖）。

## 8. Git 与安全

- Git 仓库在**仓库根目录**（`git init -b main` 已执行），本工程没有独立 `.git`。
- 根 `.gitignore` 忽略：`node_modules/`、构建产物（`dist/unpackage` 等）、`*.log`、
  `uni_modules` 内容（保留 `.gitkeep`），以及**仓库根**的 `.env*`（用前导 `/` 锚定，
  避免误伤需要入库的 `frontend/env/*.env` 无密钥构建配置）。
- 不要把密钥、连接串口令写进任何入库文件或文档。
- 不要自动创建 commit；仅在用户明确要求时提交。

## 9. 模板派生：品牌参数化脚本（跨工程）

本仓库作为基础模板派生新项目时，**不要手工全局替换品牌字串**，统一用根目录脚本：

```powershell
bun ../scripts/init-template.mjs             # 交互式（回车保留默认值）
bun ../scripts/init-template.mjs --dry-run   # 只预览，不落盘
bun ../scripts/init-template.mjs --yes `
  --title "某某协会" --slug my-app `
  --uni-appid __UNI__XXX --wx-appid wxXXX --admin-email admin@example.com
```

（脚本位于仓库根 `scripts/init-template.mjs`，路径以脚本自身位置为基准，在任一目录下执行均可。）

- 参数：品牌中文名、英文 slug（数据库名/health 服务名）、uni-app 与微信 AppID、管理员邮箱。
- 替换范围是脚本内**白名单文件**（前端 env/pages.config/页面与布局、后端 env 示例/后台页面/
  drizzle.config/health、根 AGENTS.md）；env 按键名幂等赋值、源码做一次性字面量替换。
  `.trae/` 历史文档、lockfile、二进制资产不处理。
- 脚本结束会打印仍需手动处理的清单：应用图标、Android 权限、生产域名、`backend/.env`
  密钥（BETTER_AUTH_SECRET/WECHAT/COS）、slug 变更后的建库与迁移、package.json 元信息、
  LICENSE、git remote。

# 第二部分：unibest 模板规范（Hermes）

## unibest 项目概览

基于 uniapp + Vue3 + TypeScript + Vite5 + UnoCSS 的跨平台开发框架,支持 H5、小程序、APP 多平台,无需 HBuilderX,命令行开发。

## 工程规范(Hermes)

详细规范唯一事实源在 [hermes/](./hermes/README.md),按场景取用:

| 场景 | 文档 |
|------|------|
| 架构:事实源与生成物、平台接缝、校验边界、目录分层 | [hermes/architecture.md](./hermes/architecture.md) |
| 代码:命名、SFC 结构、TS、状态、提交、合入门禁 | [hermes/conventions.md](./hermes/conventions.md) |
| 平台:差异决策树、条件编译速查、本项目差异点表 | [hermes/platforms.md](./hermes/platforms.md) |
| 请求:分层、错误四分类、401 双 token 策略 ⚠️ | [hermes/api.md](./hermes/api.md) |
| SOP:新页面/全局组件/分包/tabbar/hooks | [hermes/sop-new-page.md](./hermes/sop-new-page.md) |
| 性能:分包规则、包体积检查、编码侧规则 | [hermes/performance.md](./hermes/performance.md) |
| 发布:upload:mp、changesets、uvm、环境切换 | [hermes/release.md](./hermes/release.md) |

> ⚠️ **`hermes/api.md` 的双 token 认证/请求章节已废弃**：本项目改为 Better Auth Cookie
> 单通道（不注入 Authorization），**以本文件第一部分 §5 为准**；该文档中与认证无关的
> 请求分层、错误分类等通用内容仍可参考。

三条铁律(全文见 hermes/README.md):

1. **生成物不手改**:`src/pages.json`、`src/manifest.json`、`src/types/*.d.ts` 由 `*.config.ts` 生成,手改会被覆盖
2. **平台差异只用条件编译**:编译期能确定的不留运行时
3. **UI 优先原子类**:先 UnoCSS,再自定义 CSS

## AI 辅助 Skills

项目自带 `.agents/skills/`(信任项目后自动加载),按场景选用:

| Skill | 用途 |
|-------|------|
| uni-app | 框架文档参考:条件编译、生命周期、pages/manifest 配置;查官方文档优先用其推荐的 `search-docs-by-Uniapp-official` MCP 工具 |
| uniapp-project | 官方组件/API 集成细节与跨端兼容性 |
| uview-pro-vue3 | uView Pro 组件库参考(项目当前未安装该依赖,使用前先安装) |

## 核心配置文件

- [package.json](./package.json) - 依赖和脚本
- [vite.config.ts](./vite.config.ts) - 构建配置（含 /api 代理）
- [pages.config.ts](./pages.config.ts) - 路由配置(事实源)
- [manifest.config.ts](./manifest.config.ts) - 应用清单(事实源)
- [uno.config.ts](./uno.config.ts) - UnoCSS 配置

## 常用命令

```bash
bun install       # 安装依赖（本工程统一使用 Bun，勿用 pnpm/npm）
bun run dev:h5    # H5（http://localhost:9000）
bun run dev:mp    # 微信小程序
bun run dev:app   # APP
bun run build:mp  # 微信小程序生产构建
bun run upload:mp # 小程序上传(见 hermes/release.md)

# 合入前门禁(三条全过；PowerShell 用 ; 串联)
bun run type-check; bun run lint; bun run test:run
```
