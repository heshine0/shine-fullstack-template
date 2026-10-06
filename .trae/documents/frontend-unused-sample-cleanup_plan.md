# Frontend Unused Sample Code Cleanup — Implementation Plan

## Repository Research

Scope: `frontend/` only (unibest 4.4 template, now a Cookie-auth project). Every candidate was traced via import/reference search across `src/`, configs, `env/`, and tests. Findings fall into four groups.

### Live architecture (must keep)
- Entry: `src/main.ts` → `App.vue`; stores: `src/store/index.ts` + `src/store/auth.ts` (Pinia, Cookie-only).
- HTTP fact chain: `src/http/alova.ts` + `src/http/interceptor.ts` + `src/http/cookie-jar.ts` + `src/http/tools/queryString.ts` + `src/http/types.ts` (partially).
- Live APIs: `src/api/auth.ts`, `media.ts`, `profile.ts`.
- Live utils: `debounce.ts`, `phone.ts`, `systemInfo.ts`, `toLoginPage.ts`, `cos-post.ts`, `upload-media.ts`; `utils/index.ts` helpers used by router/login.
- Live UI: `pages/index`, `pages/about` (linked from `me.vue` + `layouts/default.vue` menu), `pages/login`, `pages/me/me`, `pages/me/profile`, `layouts/default.vue`+`blank.vue`, whole `tabbar/` dir, `components/media-uploader`.
- Static kept: `logo.svg` (login + home), `images/default-avatar.png` (me.vue), `tabbar/home*.png`/`personal*.png` (referenced by `nativeTabbarList` config), `app/icons/*` (manifest.config.ts).

### Key subtlety — template store feeding a live feature
`src/tabbar/store.ts` performs role-based tab filtering and route guarding (with passing tests in `tabbar/store.test.ts`, `router/interceptor.test.ts`), but reads roles from the **template** `useUserStore` (`src/store/user.ts`), which is **never populated** in the real Cookie chain (the real user, with `roles: string[]`, lives in `useAuthStore`). Result today: the `roles: ['admin']` 关于 tab is hidden for everyone, including admins. The cleanup rewires this one consumer to `useAuthStore` (matching AGENTS.md §8), which then allows the entire template auth chain to be deleted. Behavior change: the 关于 tab becomes correctly visible to admins — this matches its existing config and its two menu entry points.

### Out of scope (documented here, not touched)
- Docs/skills: `hermes/`, `.agents/`, `.cursor/`, root/template `README.md`s (not executable code; separate doc decision).
- Generated files `src/pages.json`, `src/manifest.json`, `src/types/*.d.ts` (auto-regenerated; never hand-edited per AGENTS.md §8).
- `tabbar/index.vue` bulge (middle-button) feature: component capability, coherent with `TabbarItem.vue`, not orphan demo.
- Login page prefilled local-dev credentials (`admin@tongxiangwuxie.local`): intentional, commented.
- No page is deleted (about/index/login/me/profile all kept), so page routing is unaffected.

## Files and Modules

### A. Delete — zero live references (dead template/demo code)

| Path | Why it is dead |
|---|---|
| `src/App.ku.vue` | uni-ku demo App ("Hello AppKuVue"); real entry is `App.vue`, no reference to it. |
| `src/api/foo.ts` | Demo endpoints ("菲鸽") built on deleted `http/http.ts`; no caller. |
| `src/api/foo-alova.ts` | Demo endpoint; only consumer of `API_DOMAINS.SECONDARY`; no caller. |
| `src/service/` (4 files) | openapi-ts-request demo generated against template `ukw0y1.laf.run` schema; only depends on deleted `vue-query.ts`. |
| `src/http/http.ts` | Template simple-http client + dual-token refresh; callers only `api/foo.ts`, `api/login.ts`. |
| `src/http/vue-query.ts` | openapi adapter wrapping `http.ts`; callers only `src/service/*`. |
| `src/http/tools/enum.ts` | Only imported by `http/http.ts`. (`tools/queryString.ts` stays — used by live interceptor.) |
| `src/store/token.ts` | Template single/dual-token Pinia store; caller only `http/http.ts`; forbidden by Cookie-only auth. |
| `src/api/login.ts` | Template token auth API (`/auth/login`, `refreshToken`, `wxLogin`); callers only `store/token.ts`, `store/user.ts`. |
| `src/api/types/login.ts` | Token-oriented types; after rewiring tabbar, no consumer remains. |
| `src/store/user.ts` + `src/store/user.test.ts` | Template user store, never populated at runtime; sole real consumer `tabbar/store.ts` is rewired to `useAuthStore`. |
| `src/hooks/useRequest.ts` + `useRequest.test.ts` | Generic demo hook; no importer except its own test. Auto-imported via `dirs: ['src/hooks']`, dts regenerated after deletion. |
| `src/hooks/useUpload.ts` | No importer; real upload path is `utils/upload-media.ts` + `media-uploader` (uni.uploadFile). |
| `src/hooks/useScroll.ts` + `useScroll.md` | No importer; doc references a nonexistent `@/service/list`. |
| `src/utils/uploadFile.ts` | Standalone demo upload composable (`uploadFileUrl`, internal `useUpload`); no external importer; superseded by `upload-media.ts`. |
| `src/utils/updateManager.wx.ts` | wx mini-program update-manager util; never registered in `App.vue`, no importer. |
| `src/style/iconfont.css` | Sample iconfont (iconfont project id 4543091); only reference is a commented-out `@import` in `index.scss`. Tabbar uses UnoCSS carbon icons. |
| `src/http/README.md` | Documents the 3-way http.ts/vue-query/alova choice; two variants deleted → misleading stale doc. |
| `src/static/tabbar/example.png`, `exampleHL.png` | No reference anywhere. |
| `src/static/tabbar/scan.png` | Referenced only in a commented bulge example in `tabbar/config.ts`. |
| `src/static/images/avatar.jpg` | No reference (the real default is `default-avatar.png`). |
| `src/static/my-icons/copyright.svg` | No `i-my-icons-*` usage anywhere; UNO loader registration in `uno.config.ts` stays as generic infra. |

### B. Edit — rewire live feature off the template store

- `src/tabbar/store.ts`: replace `useUserStore` with `useAuthStore`; `userRoles` reads `useAuthStore().user?.roles ?? []`; drop `UserRole` import (use `string[]`).
- `src/tabbar/types.ts`: `roles?: UserRole[]` → `roles?: string[]`; remove `@/api/types/login` import.
- `src/store/index.ts`: remove `export * from './token'` and `export * from './user'`.
- `src/tabbar/store.test.ts`: seed roles via `useAuthStore()` instead of `useUserStore().setUserInfo(...)`; drop the single-`role`-field case (AuthUser only has `roles: string[]`).
- `src/router/interceptor.test.ts`: same seeding change in `invoke()`.

### C. Edit — trim dead exports / sample content in live files

- `src/http/types.ts`: keep only `CustomRequestOptions` (used by live interceptor; references global `IUniUploadFileOptions`). Delete `CustomRequestOptions_`, `HttpRequestResult`, `HttpError`, `IResponse`, `PageParams`, `PageResult` (all only used by deleted chain).
- `src/http/alova.ts`: remove template-compat `API_DOMAINS` export (only `foo-alova.ts` used `SECONDARY`).
- `src/utils/index.ts`: remove `isDoubleTokenMode` (token chain), `getAllPages`, `getCurrentPageI18nKey`, `currRoute` (only consumer was `App.ku.vue`; `parseUrlToObj`/`getLastPage` used by router stay) and then-unused imports (`PageMetaDatum`, `SubPackages`; `pages`/`HOME_PAGE` stay — HOME_PAGE is used).
- `src/typings.ts`: remove sample `TestEnum` and the duplicated local `IUniUploadFileOptions` (global one in `typings.d.ts` is the one actually resolved); keep `RemoveLeadingSlash*` (used by `tabbar/types.ts`).
- `src/env.d.ts`: remove `VITE_AUTH_MODE` declaration.
- `src/style/index.scss`: remove `.test` sample class, commented iconfont `@import`, and commented box-sizing block; keep `:root, page`.
- `uno.config.ts`: remove unused safelist icon `i-carbon-ibm-watson-language-translator` (keep `i-carbon-code/home/user/menu`).
- `env/.env`: remove template vars `VITE_SERVER_BASEURL_SECONDARY` (laf.run demo) and `VITE_AUTH_MODE`; change `VITE_APP_PROXY_PREFIX` `/fg-api` → `/api` (project standard per AGENTS.md §6); change demo `VITE_SERVER_BASEURL` `https://ukw0y1.laf.run` → `http://localhost:3000`; change `VITE_APP_TITLE` `unibest` → `桐乡武协`.
- `pages.config.ts`: `globalStyle.navigationBarTitleText` `unibest` → `桐乡武协`.
- `src/pages/index/index.vue`: replace unibest promotional content (logo block, "最好用的 uniapp 开发模板", author 菲鸽, unibest.tech, demo `console.log`s) with a minimal project home placeholder keeping `definePage({ type: 'home' })` and title `首页`. Route/tabbar contract unchanged.
- `src/App.vue`: remove template debug `console.log` calls in `onLaunch/onShow/onHide` (logic untouched).

### D. Optional (requires pnpm install + lockfile churn — default SKIP unless approved)

- Remove unused `z-paging` dep: `package.json` dependency + `tsconfig.json` `types: ["z-paging/types"]` + the z-paging `easycom.custom` rule in `pages.config.ts` (and mirror in `scripts/create-base-files.js`). No `<z-paging>` usage exists.
- Remove openapi generator leftovers now that `src/service/` is deleted: `openapi-ts-request.config.ts`, `"openapi"` script and `openapi-ts-request` devDependency.

## Implementation Steps

1. Delete all files/dirs in group A.
2. Rewire tabbar role filtering to `useAuthStore` (group B) and update the two test files; delete `user.test.ts` with the store.
3. Trim exports/types/config in group C; update `env/.env` branding/proxy values.
4. Replace the home page sample content; strip debug logs in `App.vue`.
5. Regenerate auto-generated type declarations (stale `src/types/auto-import.d.ts` still lists deleted hooks): run the H5 dev server briefly (`bun run dev:h5`, then stop) or `bun run build:h5` once.
6. If approved for group D, edit package.json/tsconfig/pages.config/script and run `pnpm install --ignore-scripts --no-frozen-lockfile`.
7. Run all three quality gates (below), fix fallout.
8. Update this plan document with an execution-results section (serves as the required removal record with justifications).

## Dependencies and Considerations

- `store/index.ts` currently re-exports the two deleted stores — must be edited in the same change or every Pinia consumer breaks.
- Test files must move to `useAuthStore` in the same change as the store deletion; the module-level `computed` caching note in `router/interceptor.test.ts` (needs `vi.resetModules()`) still applies.
- `src/types/auto-import.d.ts` is generated from `src/hooks`; deleting hook files without regeneration makes `vue-tsc` fail on missing modules — step 5 is mandatory before type-check.
- `.env` edits affect only defaults: `.env.development` already overrides proxy/BASEURL for local H5; production currently inherits the laf.run demo URL, so replacing it also removes a latent misconfiguration.
- Admin-only 关于 tab changes from "always hidden" to "visible for admins" — intended fix; no data loss, no route change.

## Validation

- `cd frontend; bun run type-check` → 0 errors.
- `cd frontend; bun run lint` → 0 problems (auto-fix allowed via `bun run lint:fix`).
- `cd frontend; bun run test:run` → all suites green (updated tabbar/router tests, existing debounce/phone/TabbarItem tests).
- Grep sweep for deleted symbols: `useTokenStore|useUserStore|api/login|http/http|vue-query|@/service|foo-alova|API_DOMAINS|VITE_AUTH_MODE|isDoubleTokenMode` → no source hits.
- H5 smoke (optional, if backend available): home renders; tabbar shows 首页/我的 (and 关于 for admin); login → me/profile works; media-uploader on profile unchanged.

## Risks

- **Behavior change in tabbar role visibility** — mitigated: it makes explicit existing config (`roles: ['admin']`) actually work using the real authenticated roles; about page remains reachable by URL and menus.
- **Stale generated dts after hook deletion** — mitigated by mandatory regeneration step before gates.
- **Optional dependency removal causing install issues on Windows sandbox** — group D defaults to skip; if attempted, AGENTS.md §9 flags (`--ignore-scripts --no-frozen-lockfile`) are included.

## Execution Results（删除/修改记录）

### 质量门禁（全绿）

- `bun run type-check`（vue-tsc --noEmit）：0 error。
- `bun run lint`（eslint）：0 problem。
- `bun run test:run`（vitest）：5 个测试文件 / 44 个用例全部通过
  （debounce 4、phone 5、TabbarItem 6、interceptor 9、tabbar/store 20）。
- 生成物：删除过期的 `src/types/auto-import.d.ts` 后启动一次 `bun run dev:h5`，
  插件基于空的 `src/hooks/` 完整重建，确认不再包含任何已删 hook 声明
  （`src/types/` 整个目录 gitignore，不入库）。

### A 组：已删除（29 个文件 + 3 个目录 + 1 个空 hooks 目录保留）

按上表全部执行：`App.ku.vue`；`api/foo.ts`、`foo-alova.ts`、`login.ts`、`api/types/`；
`service/`；`http/http.ts`、`vue-query.ts`、`tools/enum.ts`、`README.md`；
`store/token.ts`、`user.ts`、`user.test.ts`；`hooks/useRequest(.test).ts`、
`useUpload.ts`、`useScroll.ts(.md)`；`utils/uploadFile.ts`、`updateManager.wx.ts`；
`style/iconfont.css`；静态资源 `tabbar/example(HL).png`、`tabbar/scan.png`、
`images/avatar.jpg`、`my-icons/copyright.svg`（目录随之清空）。
说明：空的 `src/hooks/` 目录保留（unplugin-auto-import 的 dirs 扫描目标，后续可放新 hook）。

### B 组：tabbar 角色过滤改接 useAuthStore（已执行）

- `tabbar/store.ts` 改用 `useAuthStore().user?.roles ?? []`；`tabbar/types.ts`
  的 `roles?: string[]`，去掉 `@/api/types/login` 依赖。
- `store/index.ts` 移除 token/user 再导出。
- `tabbar/store.test.ts`、`router/interceptor.test.ts` 全部改为向 `useAuthStore()`
  注入 `{ roles } as AuthUser`；单 role 字段用例随模板类型一并移除。
- **行为变化（符合预期）**：「关于」tab（`roles: ['admin']`）此前因读取永远为空的
  模板 userStore 而对所有人隐藏，现对 admin 角色正确可见。

### C 组：存活文件内的死代码裁剪（已执行，含计划外追加项）

计划内：`http/types.ts`、`http/alova.ts`（去 `API_DOMAINS`）、`utils/index.ts`、
`typings.ts`、`env.d.ts`、`env/.env`、`pages.config.ts`、首页占位化、App.vue 去日志，
均按计划完成。

执行阶段逐文件复核时追加清理（同为模板示例/不可达代码，门禁验证无影响）：

| 文件 | 追加清理内容 | 理由 |
|---|---|---|
| `src/App.vue` | 移除未使用的 `onHide` import | 删 onHide 钩子后的悬挂导入 |
| `src/utils/index.ts` | 删除文件头失效的 `eslint-disable style/indent` | 缩进特例代码已删，指令变为 no-op（lint 唯一 warning） |
| `src/typings.d.ts` | 删除全局 `IResData<T>`、`IUserInfo`、`IUserToken` 三个接口 | 全仓零引用；后两者随 token/user 链删除而失效；保留仍被 `http/types.ts` 使用的 `IUniUploadFileOptions` |
| `src/utils/systemInfo.ts` | 删除 `console.log('systemInfo', …)` 及其示例打印注释块 | 模板调试残留 |
| `src/router/interceptor.ts` | 删除两段注释掉的示例（「路由不存在」分支引用已删的 `getAllPages`、「plugin:// 插件页面」分支）；删除 feige demo 路由示例注释 | 注释掉的非功能代码 |
| `src/tabbar/config.ts` | 删除鼓包配置示例块（引用已删的 scan.png）、3 处 `// badge:` 注释、「其他类型演示」(uiLib/iconfont/image) 三大段注释；合并重复的 unocss 使用说明为一条 | 注释示例；删除后配置仅保留 3 个真实 tab |
| `src/tabbar/index.vue` | 删除 `// i-carbon-code` 注册注释；删除两个空的 `success(res){ // console.log }` 回调 | 无对应图标使用；空回调非功能 |
| `src/tabbar/TabbarItem.vue` + `types.ts` | 删除空渲染的 `iconType === 'uiLib'` 模板块及 4 行 UI 库替换示例注释；类型联合与 JSDoc 同步去掉 `'uiLib'` | 该分支不渲染任何节点，且无任何 tab 使用 |
| `src/style/index.scss` | 空规则体替换为一行说明注释 | 仅剩注释变量覆盖，零输出 |
| `uno.config.ts` | safelist 去掉无使用的 `i-carbon-code`；删除 `my-icons` 图标集合（`FileSystemIconLoader` import 同步删除）；删除未使用的 `p-safe` 规则；删除整段注释掉的 `content.pipeline` 配置 | my-icons 目录已删、`p-safe` 零引用（保留在用的 `pt-safe/pb-safe`）。**对计划的偏差**：原计划「my-icons loader 作为通用基础设施保留」，执行时因其指向不存在的目录且无 `i-my-icons-*` 调用，判定为死配置并移除 |

保留并经引用核实的部分：`isBulge` 鼓包能力（类型 + 组件 + 单测完整的可配置特性，
仅无当前配置项）、`iconfont` iconType（与 unocss 共用 class 渲染分支）、
`uni.scss` 全部 `$uni-*` 变量（uni-app 平台约定文件，未使用 SCSS 变量不产出 CSS）、
`center` shortcut 与 `pt/pb-safe` 规则（多处在用）、全部现存静态资源
（logo.svg、default-avatar.png、native tabbar 4 张 PNG、app/icons）。

### Grep 复查结论

- 死符号（`useTokenStore|useUserStore|api/login|http/http|vue-query|@/service|
  foo-alova|API_DOMAINS|VITE_AUTH_MODE|isDoubleTokenMode|useRequest|useUpload|
  useScroll|updateManager|getAllPages|uiLib|IUserToken|i-carbon-code|my-icons|
  FileSystemIconLoader|p-safe`）在 `src/` 与项目配置中**零命中**。
- 仅存命中均为模板自带文档（`hermes/`、`.agents/`、`.cursor/rules/`、
  `src/tabbar/README.md` 第三方组件说明），按计划「Out of scope」不动；
  `package.json` 的 `"uiLibrary": "none"` 是脚手架元数据，与 iconType 无关。

### D 组：仍按计划 SKIP（未获批准）

`z-paging` 依赖裁剪与 openapi-ts-request 工具链移除均未执行。注意
`openapi-ts-request.config.ts` 的模板字符串仍写有已删除的 `@/http/vue-query`
路径——它仅在手动运行生成脚本时被读取，不参与 type-check/lint/运行时，不影响门禁；
待 D 组批准后随该配置文件一并删除。

### 未做的事

- 未创建任何 git commit（AGENTS.md §11：仅在用户明确要求时提交）。
- 未删除/修改任何页面与路由（首页/关于/登录/我的/资料 5 个页面全部保留）。
- 未做 H5 浏览器冒烟（后端未在本次会话确认运行）；建议联调时验证：
  首页渲染、tabbar（普通用户 2 项 / admin 3 项）、登录 → 我的/资料、资料页媒体上传。

