# 手机号验证码 + 微信手机号登录 实施计划

## 需求与决策

前端新增两种登录方式，与现有邮箱密码登录并存：

1. **手机号 + 短信验证码登录**（H5 / 小程序通用）
2. **微信「获取手机号」一键登录**（仅 `mp-weixin` 条件编译展示）

已确认决策：

- 短信通道：本轮保留**开发期日志打印**，抽出 `SmsSender` 接口，后续接服务商只改一个文件
- 微信凭证：**Mock 模式 + 真实接口预留**，新增 `WECHAT_APPID/SECRET/WECHAT_MOCK` 环境变量
- 验证码登录用户不存在：**验证通过自动注册**（Better Auth `signUpOnVerification`，经现有 hook 自动挂 `user` 角色）
- 微信登录账号匹配：**按手机号匹配/建号**，不引入 openid 新表、不做数据库迁移

## Repository Research

### 后端（better-auth 1.7.7，已装）

- Better Auth 挂载点：[server/routes/api/auth/[...].ts](file:///d:/projects/tongxiangwuxie/backend/server/routes/api/auth/%5B...%5D.ts)（`auth.handler(toWebRequest(event))`），所有 `/api/auth/**` 在 [20.auth.ts](file:///d:/projects/tongxiangwuxie/backend/server/middleware/20.auth.ts) 中经 `isPublicPath` 放行
- phoneNumber 插件已在 [server/utils/auth.ts](file:///d:/projects/tongxiangwuxie/backend/server/utils/auth.ts#L51-L58) 启用，`sendOTP` 当前只 `logger.info`。实测其原生端点：
  - `POST /api/auth/phone-number/send-otp` `{ phoneNumber }` → `{ message: 'code sent' }`
  - `POST /api/auth/phone-number/verify` `{ phoneNumber, code }` → 校验通过后**自动建会话、Set-Cookie**；配置 `signUpOnVerification.getTempEmail` 后用户不存在自动建号；返回 `{ status, token, user }`
  - OTP 存于 `verification` 表，6 位数字、默认 3 次尝试、有过期时间
- 自定义登录端点的官方做法：better-auth 导出 `createAuthEndpoint`（`better-auth/api`）与 `setSessionCookie`（`better-auth/cookies`），可在**自研插件**内拿到 `ctx.context.internalAdapter.createSession / findOne / createUser / updateUser`，与内置端点享有相同的 origin 校验与 Cookie 下发链路
- `user` 表已有 `phone_number`（unique）/`phone_number_verified` 列（[auth-schema.ts](file:///d:/projects/tongxiangwuxie/backend/server/database/auth-schema.ts#L16-L17)），**无需迁移**
- 新用户挂默认角色靠 `databaseHooks.user.create.after`（[auth.ts](file:///d:/projects/tongxiangwuxie/backend/server/utils/auth.ts#L59-L72)），插件路径的 `internalAdapter.createUser` 同样触发
- 限流：[10.rate-limit.ts](file:///d:/projects/tongxiangwuxie/backend/server/middleware/10.rate-limit.ts#L25-L32) 已对 `send-otp` 敏感限流（10/min），verify 与微信登录需补入
- env 校验集中在 [server/utils/env.ts](file:///d:/projects/tongxiangwuxie/backend/server/utils/env.ts)（zod fail-fast）

### 前端

- 请求事实源：[src/http/alova.ts](file:///d:/projects/tongxiangwuxie/frontend/src/http/alova.ts)（Cookie 单通道、`rawAuth` 标记、401 清态跳登录）；API 封装 [src/api/auth.ts](file:///d:/projects/tongxiangwuxie/frontend/src/api/auth.ts)，登录态 [src/store/auth.ts](file:///d:/projects/tongxiangwuxie/frontend/src/store/auth.ts)
- 登录页 [src/pages/login/index.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/login/index.vue) 目前仅邮箱密码表单
- 非 H5 端直连后端（条件编译已就绪），但**小程序缺手动 Cookie 管理**：真机/开发者工具不会可靠透传 Set-Cookie。本次登录响应体里 Better Auth 会返回 `token`，需要配套一个轻量 cookie jar 才能让两种新登录（及邮箱登录）在小程序里真正保持会话
- `manifest.config.ts` 已有 `VITE_WX_APPID` 与 `mp-weixin` 段（`urlCheck:false`）

## Files and Modules

### 后端新增

- `backend/server/utils/sms.ts`：`SmsSender` 抽象 + 日志实现 `logSmsSender`（从 auth.ts 搬出当前打印逻辑）；统一手机号校验（中国大陆 `+86` / `1[3-9]xxxxxxxxx` 归一化）
- `backend/server/utils/wechat.ts`：
  - `getWechatAccessToken()`：内存缓存 access_token（按 expires_in 提前 5 分钟过期）
  - `getPhoneNumberByCode(phoneCode)`：调 `wxa/business/getuserphonenumber`，返回 `purePhoneNumber`
  - mock 模式（`WECHAT_MOCK=true`）：不走微信 API，约定 `phoneCode` 形如 `mock:13800138000`，解析并校验后直接返回该号码
- `backend/server/utils/auth-wechat.ts`：better-auth 插件 `wechatPhone()`
  - 端点 `POST /wechat/phone-sign-in`，body `{ phoneCode: string }`
  - 换手机号 → 按 `phoneNumber` 查用户；不存在则建用户（`email = ${phone}@phone.local` 占位、`name =` 手机号、`phoneNumberVerified=true`）；存在则补标 `phoneNumberVerified=true`
  - `banned` 用户直接 403（登录入口即拒，避免只靠后续中间件）
  - `internalAdapter.createSession` + `setSessionCookie`，返回 `{ token, user }`
- `backend/server/utils/wechat.test.ts`：mock 串解析、非法号码、真实模式缺凭证报错等单测（vitest）

### 后端修改

- `backend/server/utils/auth.ts`：
  - `phoneNumber({ otpLength:6, expiresIn:300, sendOTP: logSmsSender, phoneNumberValidator, signUpOnVerification:{ getTempEmail: p => `${p}@phone.local` } })`
  - `plugins` 追加 `wechatPhone()`
- `backend/server/utils/env.ts`：zod 增加
  - `WECHAT_APPID: z.string().optional()`、`WECHAT_SECRET: z.string().optional()`
  - `WECHAT_MOCK: z.coerce.boolean().default(false)`
  - 校验规则：非 mock 模式下 appid/secret 缺失时，仅在**调用微信端点时**报错（不阻止服务启动）
- `backend/.env.example`：补三段配置（含注释：mock 仅限本地开发）
- `backend/server/middleware/10.rate-limit.ts`：敏感端点增加
  - `/api/auth/phone-number/verify`
  - `/api/auth/wechat/phone-sign-in`

### 前端新增

- `frontend/src/http/cookie-jar.ts`：**仅非 H5 使用**的 cookie jar
  - `saveFromResponseHeaders(headers)`：解析 `Set-Cookie`（数组/字符串、大小写兼容），按 name 合并存 `uni.storage`（key `auth-cookies`），记录 expires
  - `getCookieHeader()`：拼 `name=value; ...`
  - `clear()`
- `frontend/src/api/auth.ts`：
  - `sendPhoneOtp(phone)` → `POST /auth/phone-number/send-otp`（`rawAuth`）
  - `loginWithPhoneOtp(phone, code)` → `POST /auth/phone-number/verify`（`rawAuth`）
  - `loginWithWechatPhone(phoneCode)` → `POST /auth/wechat/phone-sign-in`（`rawAuth`）

### 前端修改

- `frontend/src/store/auth.ts`：新增 `loginByPhoneOtp(phone, code)`、`loginByWechat(phoneCode)`，成功后统一 `fetchMe()` 补全 roles；登出/401 时同步清 cookie jar
- `frontend/src/http/alova.ts`：
  - `beforeRequest`：`// #ifndef H5` 注入 `Cookie: getCookieHeader()`
  - `responded.onSuccess`：`// #ifndef H5` 用 `response.header` 落盘 Set-Cookie（Better Auth 会话轮换时会下发新 cookie，必须持续同步）
  - `handleUnauthorized`：非 H5 追加 `cookieJar.clear()`
- `frontend/src/pages/login/index.vue`：改为三种方式
  - 顶部切换：「邮箱密码」「手机验证码」；微信登录按钮独占一块
  - 手机验证码：手机号输入 + 验证码输入 + 「获取验证码」按钮（60s 倒计时、发送中禁用、前后端同款手机号正则）
  - 微信按钮：
    - `<!-- #ifdef MP-WEIXIN -->` + 非 mock：`<button open-type="getPhoneNumber" @getphonenumber="onGetPhoneNumber">`，取 `e.detail.code` 调 `loginWithWechat`
    - mock 模式（`VITE_WECHAT_MOCK==='true'`）：渲染普通按钮，`uni.showModal` 可编辑输入手机号，按 `mock:${phone}` 提交，供无认证 AppID 时在开发者工具联调
    - `// #ifdef H5` 下整块微信入口不渲染
- `frontend/env/.env.development` / `.env.production` / `.env.example`（若存在）：增加 `VITE_WECHAT_MOCK`（development=true）与 `VITE_WX_APPID` 占位说明
- 错误提示沿用 alova 统一 toast；微信端点返回的业务错误（封禁、验证码失效等）走现有非 2xx 分支，无需特殊处理

## Implementation Steps

1. **后端 SMS 抽象 + phoneNumber 插件配置**：新建 `sms.ts`，改 `auth.ts`（OTP 长度/有效期/校验/自动注册），改 `env.ts` + `.env.example`
2. **后端微信能力**：新建 `wechat.ts`（token 缓存 + getuserphonenumber + mock 解析），新建 `auth-wechat.ts` 插件并挂到 `auth.ts`
3. **后端限流与测试**：补 `10.rate-limit.ts` 敏感路径；写 `wechat.test.ts`；`bun run test/typecheck/lint`
4. **前端 API/store**：扩展 `api/auth.ts`、`store/auth.ts`
5. **前端小程序 cookie jar**：新建 `cookie-jar.ts`，接入 `alova.ts`（条件编译，H5 行为零改动）
6. **前端登录页改造**：三种登录方式 UI、倒计时、微信条件编译/mock 入口、env 变量
7. **联调验证**：
   - H5：启动 backend + frontend，浏览器走「发送验证码（从后端控制台读码）→ 验证登录 → /me 有 roles → 登出」闭环；再测一个新手机号自动建号
   - 小程序：以 type-check/lint + 条件编译检查为准（本环境无微信开发者工具，无法实跑），交付说明中写明真机验证步骤

## Dependencies and Considerations

- better-auth 1.7.7 已确认导出 `createAuthEndpoint`（`better-auth/api`）、`setSessionCookie`（`better-auth/cookies`），无需新增依赖
- 微信 API（服务器侧 `$fetch`，Nuxt 内置可用）：
  - token：`GET https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=&secret=`
  - 手机号：`POST https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=`，body `{ code: phoneCode }`
- 自动建号的占位 email 与 phone 插件保持同一规则（`${phone}@phone.local`），使两条登录路径命中同一用户；`user.email` 有 unique 约束，同号不会重复建
- 手机号统一做归一化（去空格、兼容 `+86`/`86` 前缀），避免同号多写法产生多账号
- 小程序原生网络层不执行 CORS，但 better-auth 的 origin 校验仍在；真机 wx.request 通常不带 Origin，如联调出现 origin 拒绝再向 `TRUSTED_ORIGINS` 补 `https://servicewechat.com`
- cookie jar 只存非 H5 端；H5 继续走浏览器原生 Cookie + vite 同源代理，逻辑完全隔离
- 后端三个 dev 相关后台任务正在运行（改完后端代码 Nuxt 会热重载；若配置变更不生效则手动重启）

## Validation

- 后端门禁（`backend/`）：`bun run typecheck`、`bun run lint`、`bun run test` 全绿
- 前端门禁（`frontend/`）：`bun run type-check`、`bun run lint`、`bun run test:run` 全绿
- 浏览器实测（H5）：
  1. 邮箱密码原登录路径无回归
  2. 对已有用户手机号发送 OTP → 后端日志取码 → 验证码登录成功 → 后续 `/api/me` 等请求携带会话 → 登出后会话失效
  3. 全新手机号验证码登录 → 自动建号 → `/me` roles 含 `user`
  4. 错误验证码 / 过期码返回统一错误结构并 toast
  5. 发码与验证端点触发 10/min 敏感限流（代码检查 + 可选实测）
- 代码检查：微信入口仅 `MP-WEIXIN` 编译；mock 开关仅在 development env 开启
- 小程序 cookie jar：通过单测/构造响应头验证 Set-Cookie 解析与 Cookie 头拼接（若 vitest 环境支持 uni storage mock，则补一条纯函数级测试；否则以手工逻辑走查 + type-check 为准）

## Risks

- **微信真机无法在本环境验证**：`getPhoneNumber` 必须企业认证小程序 + 微信开发者工具。缓解：mock 模式覆盖全链路联调；真实 API 代码按官方文档实现并隔离在 `wechat.ts`，配好 AppID/Secret 后只切开关
- **小程序 Cookie 持久化兼容性**：不同基础库对多 Set-Cookie 拼接有差异。缓解：jar 内按 name 自行解析合并，不依赖容器行为；会话轮换时持续用响应头更新
- **OTP 短信成本与轰炸**：send-otp 已在敏感限流内（10/min/IP）；如后续接真实短信商，需再加同手机号发送频控（本次在 `sms.ts` 预留接口位，不实现）
- **自动注册放开**：任何能收到验证码的手机号均可建号，符合当前决策；后台已有 banned 与角色管理可事后管控
- **mock 误带入生产**：`WECHAT_MOCK` 默认 false，生产 env 不设置该变量；mock 分支在日志中显著标记，便于审计
