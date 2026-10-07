# 前端多主题（主题样式切换）实施计划

## Repository Research

### 现状

- 样式体系：UnoCSS（[uno.config.ts](file:///d:/projects/tongxiangwuxie/frontend/uno.config.ts)，presetUni + presetIcons + presetLegacyCompat），全局样式入口 [src/style/index.scss](file:///d:/projects/tongxiangwuxie/frontend/src/style/index.scss) 经 [main.ts](file:///d:/projects/tongxiangwuxie/frontend/src/main.ts) 引入。
- 颜色使用现状：
  - `uno.config.ts` 仅定义了一个 `primary: 'var(--wot-color-theme,#0957DE)'`，项目代码中**几乎没有使用** `text-primary`/`bg-primary`。
  - 所有页面/布局/tabbar 直接硬编码 Tailwind 调色板类：主色实际是 `green-600/green-50/green-700`（登录按钮、协议链接、tabbar 激活色 `#018d71`、about 页文字）；中性色为 `bg-white/bg-gray-50`、`text-gray-900/800/600/400/300`、`border-gray-100/200/400`；危险色 `red-500`。
  - [media-uploader.vue](file:///d:/projects/tongxiangwuxie/frontend/src/components/media-uploader/media-uploader.vue) 已存在零散 `dark:` 类（UnoCSS 默认 media 策略，跟随系统且不可手动切换）。
  - [src/uni.scss](file:///d:/projects/tongxiangwuxie/frontend/src/uni.scss) 是 uni-app 内置 SCSS 变量（编译期，不参与运行时主题）。
- 全局根结构：[@uni-ku/root](file:///d:/projects/tongxiangwuxie/frontend/vite.config.ts#L106-L108) 启用，[src/App.ku.vue](file:///d:/projects/tongxiangwuxie/frontend/src/App.ku.vue) 的根 `<view>` 包裹 `KuRootView`（全部页面）与自定义 `FgTabbar`，是挂载全局主题 class 的理想节点；[src/App.vue](file:///d:/projects/tongxiangwuxie/frontend/src/App.vue) 的 `onLaunch` 是全局初始化入口。
- 状态管理：Pinia + pinia-plugin-persistedstate（[store/index.ts](file:///d:/projects/tongxiangwuxie/frontend/src/store/index.ts)，storage 为 `uni.getStorageSync/setStorageSync`，已 `setActivePinia`），[store/auth.ts](file:///d:/projects/tongxiangwuxie/frontend/src/store/auth.ts) 的 `persist: true` 是现成范式。
- 自定义 tabbar（[tabbar/index.vue](file:///d:/projects/tongxiangwuxie/frontend/src/tabbar/index.vue#L84-L85)）激活色硬编码 `var(--wot-color-theme, #1890ff)`、未激活 `#666`、scoped 样式里边框 `#eee`、鼓包底色 `#fff`。
- `pages.config.ts`/`manifest.config.ts` 中的 `backgroundColor/navigationBarBackgroundColor` 是原生窗口静态配置，运行时无法随 JS 主题变化（自定义导航栏下影响仅限过度滚动底色）。

### 目标

为模板建立**可运行时切换、可持久化、跨端（H5/小程序/App）生效**的主题机制：

1. 两条正交轴：**外观模式** `light | dark | auto（跟随系统）` × **品牌主题** `default（武协绿）| blue（商务蓝）`，扩展第三个品牌只需加一组变量。
2. CSS 变量 + UnoCSS 语义色 token，页面只用语义类（如 `bg-page/bg-card/text-ink/bg-primary`），不直接写死颜色。
3. 提供用户可见的切换入口（「我的」页 actionSheet），选择持久化、启动即恢复。
4. 迁移现有全部页面/布局/tabbar/组件的硬编码颜色到语义 token，使切换主题真实生效（默认 light + default 品牌保持当前视觉）。

## 设计要点

### 语义 token（UnoCSS color 名 → CSS 变量）

| token（类名用法） | 变量 | 含义 | light/default 值 |
|---|---|---|---|
| `primary` | `--c-primary` | 品牌主色（按钮/选中/链接） | `#16a34a` |
| `primary-soft` / `primary-soft-text` | 同名 | 主色浅底 / 浅底上文字 | `#f0fdf4` / `#15803d` |
| `page` | `--c-page` | 页面底色 | `#f9fafb` |
| `card` | `--c-card` | 卡片/导航栏/tabbar 底色 | `#ffffff` |
| `hover` | `--c-hover` | 按压态底 | `#f3f4f6` |
| `ink` / `sub` / `muted` | 同名 | 主文字 / 次文字 / 弱文字 | `#111827` / `#4b5563` / `#9ca3af` |
| `line` / `line-strong` | 同名 | 分割线 / 输入框描边 | `#f3f4f6` / `#9ca3af` |
| `danger` / `danger-soft` | 同名 | 危险文字描边 / 浅底 | `#ef4444` / `#fef2f2` |

dark 模式与 blue 品牌在 `themes.scss` 中给同一组变量赋不同值（dark：page `#0f1115`、card `#1a1d24`、ink `#e7eaf0` 等；blue：primary `#0957de` 系；dark×blue 的主色用组合选择器 `.theme-dark.brand-blue` 覆盖为亮蓝）。

### 变量作用域（跨端关键）

- 默认值定义在 `:root, page { ... }`，保证首屏（store 恢复前）与小程序 `page` 选择器可用。
- 模式覆盖：H5 把 class 挂到 `document.documentElement`，选择器写 `:root.theme-dark`；小程序/App 无 DOM，class 挂在 App.ku 根 `<view>`，选择器写 `.theme-dark`（CSS 变量沿组件树继承，覆盖从 `page` 继承来的值）。品牌同理：`:root.brand-blue, .brand-blue`。
- App.ku 根 view 同时加 `min-h-screen bg-page`，让深色页面底色在小程序端铺满（`page` 自身的底色不会随根 view 变量变化，由根 view 遮挡）。
- `--wot-color-theme: var(--c-primary)` 同步映射，给未来引入的 wot-design 组件用。

### auto（跟随系统）解析

- H5：`window.matchMedia('(prefers-color-scheme: dark)')` + `addEventListener('change')`（条件编译 `#ifdef H5`）。
- 微信小程序：`uni.getSystemInfoSync().hostTheme`（兜底 `theme`）初值 + `uni.onThemeChange` 监听（均在 try/catch 中，API 不存在时降级 light）。
- 其他平台：降级 light。
- 派生状态 `resolvedMode = mode === 'auto' ? systemMode : mode`；rootClass 取 `theme-${resolvedMode} brand-${brand}`。

## Files and Modules

- `frontend/uno.config.ts`：`theme.colors` 增加 13 个语义色（均映射 `var(--c-*)`）；现有 `primary` 改为 `var(--c-primary)`，不再依赖 `--wot-color-theme`。
- `frontend/src/style/themes.scss`（**新建**）：默认（light+default）变量、`.theme-dark`/`.brand-blue`/`.theme-dark.brand-blue` 变量组；仅 hex 与逗号分隔 rgba（兼容 presetLegacyCompat 与低端机）。
- `frontend/src/style/index.scss`：`@import './themes.scss'`；给 `page` 设置 `background-color: var(--c-page); color: var(--c-ink)`；映射 `--wot-color-theme`。
- `frontend/src/store/theme.ts`（**新建**）：Pinia setup store，`mode/brand` 状态（`persist: true`，key 默认 `theme`），`resolvedMode/rootClass` getter，`setMode/setBrand/init`；`init()` 内做系统主题监听（条件编译），H5 同步 class 到 documentElement，幂等防重复注册。
- `frontend/src/App.ku.vue`：根 `<view>` 绑定 `:class="themeStore.rootClass"`，加 `min-h-screen bg-page`；引入 useThemeStore。
- `frontend/src/App.vue`：`onLaunch` 中调用 `useThemeStore().init()`。
- `frontend/src/pages/me/me.vue`：新增「外观设置」菜单组（外观模式 / 主题色两行），用 `uni.showActionSheet` 选择，展示当前选择后缀；接入 theme store。
- 颜色硬编码迁移（语义替换，不改布局/逻辑）：
  - [layouts/default.vue](file:///d:/projects/tongxiangwuxie/frontend/src/layouts/default.vue)
  - [tabbar/index.vue](file:///d:/projects/tongxiangwuxie/frontend/src/tabbar/index.vue)（模板内 activeColor/inactiveColor 与 scoped 样式的 `#eee/#fff`）
  - [pages/index/index.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/index/index.vue)、[pages/about/about.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/about/about.vue)
  - [pages/login/index.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/login/index.vue)
  - [pages/me/me.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/me/me.vue)、[pages/me/profile.vue](file:///d:/projects/tongxiangwuxie/frontend/src/pages/me/profile.vue)
  - [components/media-uploader/media-uploader.vue](file:///d:/projects/tongxiangwuxie/frontend/src/components/media-uploader/media-uploader.vue)：迁移中性色/green，并**移除其 `dark:` 类**（改由 token 统一驱动，避免手动 light + 系统 dark 时局部串色）。
- `frontend/src/store/theme.test.ts`（**新建**）：vitest 单测——setMode/setBrand、resolvedMode 回退、rootClass 拼接。
- 不改动：`uni.scss`（编译期变量）、`pages.config.ts`/`tabbar/config.ts` 的原生 tabBar 静态色（当前策略是自定义 tabbar，静态配置仅兜底；默认值已与 default 品牌接近，注释说明）。

## Implementation Steps

1. **基础设施**：新建 `src/style/themes.scss` 定义四组变量（默认 + dark + blue + dark×blue）；改 `src/style/index.scss` 引入并设置 `page` 底色/文字色与 `--wot-color-theme` 映射。
2. **UnoCSS 接入**：改 `uno.config.ts` 的 `theme.colors` 为语义 token 映射。
3. **主题 store**：新建 `src/store/theme.ts`（状态、持久化、resolvedMode、rootClass、init 与系统监听、H5 documentElement 同步、卸载幂等）。
4. **全局挂载**：`App.vue` onLaunch 调 `init()`；`App.ku.vue` 根节点绑定 rootClass + `min-h-screen bg-page`。
5. **颜色迁移**：按 layouts → tabbar → 各页面 → media-uploader 顺序替换硬编码类：
   - `bg-white → bg-card`、页面外层 `bg-gray-50 → bg-page`、`bg-gray-100/50（按压/图标底）→ bg-hover`
   - `text-gray-900 → text-ink`、`gray-800/600 → text-sub`、`gray-400/300 → text-muted`
   - `border-gray-100/200 → border-line`、`border-gray-400 → border-line-strong`
   - `green-600 → primary`（bg/text）、`green-50/green-700 组合 → bg-primary-soft text-primary-soft-text`、`text-green-500/700 → text-primary`
   - `red-500 → text-danger/bg-danger`、`red-50 → bg-danger-soft`、退出按钮描边 `border-red-200 → border-danger`
6. **切换入口**：me.vue 增加「外观模式（浅色/深色/跟随系统）」「主题色（武协绿/商务蓝）」两行与 actionSheet 逻辑。
7. **单测**：新建 `theme.test.ts` 并跑通。
8. **门禁验证**（见下）。

## Dependencies and Considerations

- 不新增任何依赖，全部基于现有 UnoCSS / Pinia / persistedstate / 条件编译能力。
- UnoCSS 语义色值为裸 `var(--c-*)`，因此**不支持** `/透明度` 修饰符（如 `bg-primary/50`）；现有半透明遮罩均为 `bg-black/40`、`bg-white/90` 等内建色，不受影响；主题相关浅底一律用独立 solid token（hex），规避小程序 rgba/oklch 兼容问题。
- 语义类必须为静态字面量（UnoCSS 扫描生成），rootClass 只用于 CSS 变量作用域，不参与 UnoCSS 类生成。
- 小程序端 `uni.onThemeChange` 要求微信基础库支持且 app.json 开启 darkmode；本方案在 API 缺失/未开启时静默降级，**不修改 manifest.config.ts**（避免引入 themeLocation 等额外配置要求）；后续若要让微信原生导航/下拉底色跟随系统，可再单独开启。
- 切换 dark 后，`pages.config.ts` 配置的原生窗口底色仍是浅色；因全部页面为自定义导航 + 根 view 满铺，正常浏览不可见，仅过度滚动可能露出，记录为已知限制。
- 登录页使用 `blank` 布局但仍在 App.ku 根节点内，变量同样生效。
- `init-template.mjs` 品牌替换白名单不含新文件，主题机制作为模板能力对派生项目透明；新增品牌只需在 `themes.scss` 加变量组、在 store 的品牌联合类型与 me.vue 选项中各加一项（代码注释中写明扩展点）。

## Validation

- `cd frontend; bun run type-check`（0 error；注意生成物占位文件已在）。
- `bun run lint`（0 problem，必要时 `bun run lint:fix`）。
- `bun run test:run`（含新增 theme store 单测全绿）。
- `bun run dev:h5` 人工验证（9000 端口）：
  1. 默认视觉与改造前一致（绿主色、白卡片、灰页面底）；
  2.「我的」切换浅/深/跟随系统、绿/蓝品牌，导航栏、tabbar、登录页、资料页、弹窗即时变色；
  3. 刷新后选择保持（持久化）；
  4. auto 模式下改操作系统深浅色能跟随（H5 用浏览器/系统切换验证 matchMedia）。
- 静态检查迁移遗漏：对 `src/` 搜索 `green-|bg-white|bg-gray|text-gray|border-gray|#018d71|#1890ff`，确认仅剩有意保留项（如 tabbar/config 兜底注释）。

## Risks

- **小程序端 CSS 变量继承兼容性**：微信/支付宝现代基础库均支持 CSS 变量且 view 继承可靠；风险低。若个别低版本不生效，兜底是默认变量定义在 `page` 上（至少保证 light/default 正常）。
- **大面积类名替换漏改导致深色下白底刺眼**：通过验证清单中的 grep 收口 + H5 逐页人工过一遍缓解；media-uploader 仅 bare 模式在用，非 bare UI 也已迁移。
- **rootClass 首帧闪烁**：persist 用 `getStorageSync` 同步读取、store 在 `store/index.ts` 已立即激活，App.ku 首帧即带正确 class；H5 documentElement 同步在 onLaunch 执行（同属启动阶段），可接受；不额外做内联头脚本。
- **actionSheet 文案/品牌扩展硬编码在页面**：仅两项品牌，模板阶段可接受；扩展点在注释中标注。
