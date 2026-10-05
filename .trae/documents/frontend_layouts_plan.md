# 前端 layouts 自定义导航栏实施计划

## Repository Research

- `frontend/src/layouts/` 目前仅有 [default.vue](file:///d:/projects/tongxiangwuxie/frontend/src/layouts/default.vue)，内容仅 `<slot />`。布局由 `@uni-helper/vite-plugin-uni-layouts`（[vite.config.ts](file:///d:/projects/tongxiangwuxie/frontend/vite.config.ts#L80) 中 `UniLayouts()`）自动扫描并按 `src/pages.json` 每页的 `layout` 字段包裹页面；缺省为 `default`。`definePage()` 的类型 `PageMetaDatum` 含 `[x: string]: any`，因此 `definePage({ layout: 'blank' })` 会写入 pages.json 并被布局插件识别（无需 route-block）。
- [pages.config.ts](file:///d:/projects/tongxiangwuxie/frontend/pages.config.ts) 的 `globalStyle.navigationStyle` 当前为 `'default'`（原生导航栏），仅首页在自己的 definePage 中设了 `'custom'`。要让所有页面统一使用自定义头部，需在 globalStyle 全局改为 `'custom'`。
- 底部 tabbar 为自定义策略（CUSTOM_TABBAR），由 [App.ku.vue](file:///d:/projects/tongxiangwuxie/frontend/src/App.ku.vue#L38) 全局挂载、仅在 tab 页显示。**布局层不需要处理 tabbar**；头部整体结构一致，仅最左侧图标随页面类型变化（tab 页主页图标 / 非 tab 页返回图标）。
- 登录态：[store/auth.ts](file:///d:/projects/tongxiangwuxie/frontend/src/store/auth.ts) 提供 `isLoggedIn` / `user` / `logout()`；[toLoginPage.ts](file:///d:/projects/tongxiangwuxie/frontend/src/utils/toLoginPage.ts) 跳转登录页并自动携带 redirect 回跳。
- 状态栏高度：[systemInfo.ts](file:///d:/projects/tongxiangwuxie/frontend/src/utils/systemInfo.ts) 已导出 `systemInfo.statusBarHeight`（微信走 `getWindowInfo`，其余走 `getSystemInfoSync`）。
- 现有 `pt-safe` 使用点：首页（default 布局，需移除避免与头部占位双重 padding）、登录页（blank 布局，保留）。
- 线框图已与用户确认：**tab 页**最左侧为主页图标；**非 tab 页**最左侧为返回图标（点击 `navigateBack`，无上一页时回首页 tab）。游客其后跟「登录按钮」；已登录后跟「用户图标 + 三条线」；标题在右侧；三条线弹出菜单，菜单项复用我的页（首页、活动报名、我的收藏、消息通知、关于桐乡武协，底部退出登录）；登录页使用 blank 布局。
- tab 页判定可直接复用 [tabbar/store.ts](file:///d:/projects/tongxiangwuxie/frontend/src/tabbar/store.ts#L75) 已导出的 `isPageTabbar(path)`（App.ku.vue 同样用它）；首页常量 `HOME_PAGE` 在 [utils/index.ts](file:///d:/projects/tongxiangwuxie/frontend/src/utils/index.ts#L151) 已导出。

## Files and Modules

- `frontend/src/layouts/default.vue`：**重写**。fixed 自定义头部（状态栏占位 + 44px 导航栏）+ 页面内容容器（顶部留出头部高度）+ 三条线弹出菜单及遮罩。
- `frontend/src/layouts/blank.vue`：**新建**。无导航栏布局，仅透传 `<slot />`。
- `frontend/pages.config.ts`：`globalStyle.navigationStyle` 改为 `'custom'`，全局关闭原生导航栏。
- `frontend/src/pages/login/index.vue`：definePage 增加 `layout: 'blank'`（登录页无导航栏）。
- `frontend/src/pages/index/index.vue`：移除 definePage 中冗余的 `navigationStyle: 'custom'`（已全局生效）；根节点移除 `pt-safe`（头部 fixed 已提供占位）。

## default.vue 结构设计

```
<view fixed top-0 z-999 （头部）>
  <view :style="{ height: statusBarHeight + 'px' }" />   <!-- 状态栏占位 -->
  <view h-44px flex items-center px-3 border-b>
    <view 左部分 flex items-center gap-2>
      <!-- tab 页：主页图标；非 tab 页：返回图标 -->
      <view v-if="isTab" icon-btn @click="goHome"><view i-carbon-home /></view>
      <view v-else icon-btn @click="goBack"><view i-carbon-arrow-left /></view>
      <!-- 游客 -->
      <view v-if="!auth.isLoggedIn" 登录按钮 @click="toLoginPage()">登录</view>
      <!-- 已登录 -->
      <template v-else>
        <view icon-btn @click="goMe"><view i-carbon-user /></view>
        <view icon-btn @click="menuOpen = true"><view i-carbon-menu /></view>
      </template>
    </view>
    <text 右部分 ml-auto>{{ title }}</text>
  </view>
</view>

<view :style="{ paddingTop: statusBarHeight + 44 + 'px' }"><slot /></view>

<!-- 菜单：全屏透明遮罩 z-1001 + 弹出卡片 z-1002，卡片锚定头部下方左侧 -->
<view v-if="menuOpen" fixed inset-0 z-1001 @click="menuOpen = false" />
<view v-if="menuOpen" absolute z-1002 class="left-3" :style="{ top: statusBarHeight + 44 + 'px' }">
  首页 / 活动报名 / 我的收藏 / 消息通知 / 关于桐乡武协 / 退出登录
</view>
```

- 导航栏高度固定 44px（小程序/H5 通用标准）；头部白底、下边框 1px。
- 图标按钮：`h-8 w-8 center rounded-full bg-gray-50 text-gray-600`，图标用 carbon 图标集（与 tabbar 一致）。
- 登录按钮：胶囊样式 `rounded-full bg-green-50 text-green-700 text-3.5 px-3 py-1`。
- 菜单项及行为：
  | 菜单项 | 图标 | 行为 |
  |---|---|---|
  | 首页 | i-carbon-home | `uni.switchTab` → `/pages/index/index`，关闭菜单 |
  | 活动报名 | i-carbon-calendar | toast「功能开发中」（与 me.vue 一致） |
  | 我的收藏 | i-carbon-star | toast「功能开发中」 |
  | 消息通知 | i-carbon-notification | toast「功能开发中」 |
  | 关于桐乡武协 | i-carbon-information | `uni.switchTab` → `/pages/about/about`，关闭菜单 |
  | 退出登录 | i-carbon-logout | `await auth.logout()` → `uni.reLaunch` 登录页（红色文字区分） |
- 标题解析：组件内维护 `PAGE_TITLES: Record<string, string>`（5 个页面路径→标题，与各页 definePage 中的 navigationBarTitleText 一致，注释标明需同步）；在 `onMounted` 中取 `getCurrentPages()` 末页的 `.route` 匹配得出当前页标题，打开菜单时顺带重算一次。
- tab 页判定与返回逻辑：`onMounted` 中以同一 route 调用 `isPageTabbar(path)`（从 `@/tabbar/store` 导入）得到 `isTab` ref。`goBack()` 优先 `uni.navigateBack({ delta: 1 })`；当页面栈深度 ≤ 1（如分享链接直达）时兜底 `uni.switchTab({ url: HOME_PAGE })`，避免无响应。
- 动态绑定的 carbon 图标类（菜单）无法被 UnoCSS 静态扫描，在 `<script setup>` 顶部按 me.vue 的做法加注释占位（`// i-carbon-home i-carbon-calendar ...`），或直接在模板中逐行写死 class（菜单项为静态配置，写死 class 更简单可靠）。

## Implementation Steps

1. 修改 [pages.config.ts](file:///d:/projects/tongxiangwuxie/frontend/pages.config.ts)：globalStyle `navigationStyle: 'custom'`。
2. 新建 [blank.vue](file:///d:/projects/tongxiangwuxie/frontend/src/layouts/blank.vue)：仅 `<template><slot /></template>`。
3. 重写 [default.vue](file:///d:/projects/tongxiangwuxie/frontend/src/layouts/default.vue)：按上述结构实现头部、内容占位、弹出菜单、标题解析。
4. 修改登录页 definePage：增加 `layout: 'blank'`。
5. 修改首页：移除 definePage 中 `navigationStyle: 'custom'`，根节点移除 `pt-safe`。
6. 重启/依赖 HMR 后做浏览器验证，跑质量门禁。

## Dependencies and Considerations

- 全部使用项目已有依赖与已有工具（systemInfo、auth store、toLoginPage、carbon 图标集），不引入新依赖。
- 布局插件在编译期把页面模板包进布局组件，页面侧无需改动结构；blank 布局经 pages.json 的 `layout` 字段生效。
- H5 为当前主联调端；实现需同时兼容 MP-WEIXIN（fixed 定位 + statusBarHeight 均为通用方案，条件编译不需要）。
- 菜单遮罩 z-1001 高于自定义 tabbar（z-1000），tab 页打开菜单时底部 tabbar 一并被遮罩拦截，点遮罩任意位置关闭。

## Validation

- 门禁（在 `frontend/`）：`bun run type-check`、`bun run lint`、`bun run test:run`，期望全绿。
- 浏览器手动验证（http://localhost:9000）：
  1. 游客访问首页：头部为「主页图标 + 登录按钮 + 右侧标题」，底部 tabbar 正常；
  2. 点登录按钮 → 登录页本身无自定义导航栏（blank），登录成功后回跳首页，头部切换为「主页 + 用户 + 三条线」；
  3. 点用户图标 → 进入「我的」tab；点主页图标 → 回到首页 tab；
  4. 非 tab 页（从我的进入个人信息 `/pages/me/profile`）：同一套头部、标题为「个人信息」、无底部 tabbar，**最左侧为返回图标**，点击返回「我的」页；
  5. 三条线菜单：弹出/点遮罩关闭/菜单项跳转与 toast 正确；退出登录后回登录页且头部恢复游客态；
  6. 头部不遮挡各页内容、状态栏区域无重叠（H5 顶部安全区视觉检查）。

## Risks

- **布局组件中 onShow 等页面生命周期可能不触发**：标题解析改用 Vue 的 `onMounted` + 打开菜单时重算，避免依赖页面生命周期。
- **fixed 头部与页面自有顶部 padding 双重占位**：已在步骤 5 移除首页 `pt-safe`；其余 default 布局页面（me/about/profile）无 safe-area 顶部 padding，不受影响。
- **UnoCSS 漏生成动态图标**：菜单项使用静态 class（在模板/静态配置里写死完整类名），不做字符串拼接。
- **PAGE_TITLES 与 pages.json 标题漂移**：记录仅 5 条并在代码注释标明与 definePage 同步；若后续页面增多再考虑统一收敛。
