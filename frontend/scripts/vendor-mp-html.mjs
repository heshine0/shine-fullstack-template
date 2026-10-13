/**
 * mp-html 定制构建（vendoring）脚本
 *
 * 背景：npm 包 mp-html 的 dist/uni-app 只含基础渲染组件，不含任何插件；
 * editable/audio 等插件必须通过仓库自带 gulp 工具链编入组件包。
 *
 * 流程：
 *   1. 校验 node_modules/mp-html 版本；
 *   2. 整包复制到工作目录 .mp-html-build/；
 *   3. 改写 tools/config.js 的 plugins 列表为 audio + editable；
 *   4. 工作目录内 bun install 安装 gulp 构建链并执行 gulp build --uni-app；
 *   5. 校验产物特征后同步到 src/components/mp-html/（随仓库提交）。
 *
 * 用法：bun run vendor:mp-html
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const VERSION = '2.5.2'
const PLUGINS = ['audio', 'editable']

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const sourceDir = path.join(frontendRoot, 'node_modules', 'mp-html')
const workDir = path.join(frontendRoot, '.mp-html-build')
const distUniApp = path.join(workDir, 'dist', 'uni-app')
const buildOutput = path.join(distUniApp, 'components', 'mp-html')
const targetDir = path.join(frontendRoot, 'src', 'components', 'mp-html')
// App（nvue）端 webview 渲染所需的静态资源（H5/MP 条件编译剔除，同步仅为多端完整性）
const buildStatic = path.join(distUniApp, 'static')
const targetStatic = path.join(frontendRoot, 'src', 'static')

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: workDir,
    stdio: 'inherit',
    shell: true,
    ...options,
  })
  if (result.status !== 0)
    throw new Error(`命令执行失败（exit ${result.status}）：${cmd} ${args.join(' ')}`)
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  }
  catch {
    return false
  }
}

async function main() {
  // 1. 校验源码包
  const pkgPath = path.join(sourceDir, 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  if (pkg.version !== VERSION) {
    throw new Error(
      `node_modules/mp-html 版本为 ${pkg.version}，期望 ${VERSION}。请执行：bun add -d mp-html@${VERSION}`,
    )
  }
  console.log(`✓ mp-html@${pkg.version} 源码校验通过`)

  // 2. 复制到工作目录（先清空，保证幂等）
  await fs.rm(workDir, { recursive: true, force: true })
  await fs.cp(sourceDir, workDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(sourceDir, src)
      return !rel.split(path.sep).includes('node_modules')
    },
  })
  console.log('✓ 已复制源码到 .mp-html-build/')

  // 3. 改写 tools/config.js 的 plugins 数组（数组内仅有插件名/注释、无嵌套括号，
  // 用 [^\]]* 匹配到首个 ] 即可，保持正则线性回溯）
  const configPath = path.join(workDir, 'tools', 'config.js')
  const configSource = await fs.readFile(configPath, 'utf8')
  const pluginsPattern = /plugins:\s*\[[^\]]*\]/
  const pluginsReplacement = `plugins: [${PLUGINS.map(p => `'${p}'`).join(', ')}]`
  if (!pluginsPattern.test(configSource))
    throw new Error('未能在 tools/config.js 中定位 plugins 数组，脚本可能与新版 mp-html 不兼容')
  await fs.writeFile(configPath, configSource.replace(pluginsPattern, pluginsReplacement))
  console.log(`✓ 已启用插件：${PLUGINS.join(', ')}`)

  // 3.1 兼容性补丁：uni-app 的 unplugin-auto-import 会把 Options API 中的
  // `this._ctx.onError(...)` 成员调用错误改写为非法语法
  // `this.("onError" in _ctx ? ...)(...)`（onError 与 App 生命周期钩子同名），
  // 导致 H5 端整个 mp-html 模块图 SyntaxError。改用方括号成员访问避开标识符转换，
  // 运行时语义等价（bracket notation 全端合法）。
  const audioSrcPath = path.join(workDir, 'plugins', 'audio', 'uni-app', 'audio.vue')
  let audioSource = await fs.readFile(audioSrcPath, 'utf8')
  const brokenCall = 'this._ctx.onError('
  const patchedCall = 'this._ctx[\'onError\']('
  if (!audioSource.includes(brokenCall)) {
    throw new Error('audio.vue 中未找到待补丁的 this._ctx.onError( ，请核对 mp-html 版本差异')
  }
  audioSource = audioSource.split(brokenCall).join(patchedCall)
  await fs.writeFile(audioSrcPath, audioSource)
  console.log('✓ 已补丁 audio.vue 的 onError 成员调用（兼容 uni-app auto-import 转换）')

  // 3.2 兼容性补丁：node.vue 的 childs watcher 在列表缩短时会向传入数组 push({})
  // 做“空填充”（规避小程序列表缩短整表刷新）。H5 Vue3 下传入数组即 mp-html 实例
  // 的 nodes 本体（如撤销 insertText 后恢复的旧数组），填充会导致 getContent() 序列化
  // 出多余的 <undefined></undefined>。H5 的 v-for 本身正确处理列表缩短，用条件编译
  // 在 H5 端剔除该填充逻辑（小程序/App 保持上游行为）。
  const nodeSrcPath = path.join(workDir, 'src', 'uni-app', 'components', 'mp-html', 'node', 'node.vue')
  let nodeSource = await fs.readFile(nodeSrcPath, 'utf8')
  const padBlock = [
    '        // 列表缩短会刷新整个列表，因此进行空填充',
    '        while (this.nodes.length > nodes.length) {',
    '\t\t\t    nodes.push({})',
    '\t\t    }',
  ].join('\r\n')
  const patchedPadBlock = [
    '        // 列表缩短会刷新整个列表，因此进行空填充',
    '        // #ifndef H5',
    '        while (this.nodes.length > nodes.length) {',
    '\t\t\t    nodes.push({})',
    '\t\t    }',
    '        // #endif',
  ].join('\r\n')
  if (!nodeSource.includes(padBlock)) {
    throw new Error('node.vue 中未找到待补丁的空填充代码块，请核对 mp-html 版本差异（缩进/空白变化）')
  }
  nodeSource = nodeSource.split(padBlock).join(patchedPadBlock)
  await fs.writeFile(nodeSrcPath, nodeSource)
  console.log('✓ 已补丁 node.vue 的列表缩短空填充（H5 端条件编译剔除）')

  // 3.3 兼容性补丁：editable 插件注入 node.vue 的 getTop() 在 H5 端取
  // `top = e.pageY`。uni-h5（Vue3）的 @tap 事件是包装事件（type/target/detail/
  // currentTarget/touches/changedTouches），并不携带 pageY，导致 top=NaN、
  // 气泡菜单内联样式 `top:NaNpx` 失效，菜单以 auto 定位掉到编辑器内容末尾并被
  // _root 的 overflow 裁切。包装事件的坐标位于 touches/changedTouches[0].pageY
  // （文档坐标，与 currentTarget.offsetTop 同属相对 uni-page-wrapper 的坐标系），
  // 缺失时回退 0，由下方 offsetTop 分支兜底。
  const editableBuildPath = path.join(workDir, 'plugins', 'editable', 'uni-app', 'build.js')
  let editableBuild = await fs.readFile(editableBuildPath, 'utf8')
  const getTopBlock = [
    '  // #ifdef H5 && VUE3',
    '  top = e.pageY',
    '  // #endif',
  ].join('\r\n')
  const patchedGetTopBlock = [
    '  // #ifdef H5 && VUE3',
    '  const _touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])',
    '  top = e.pageY != null ? e.pageY : (_touch ? _touch.pageY : 0)',
    '  // #endif',
  ].join('\r\n')
  if (!editableBuild.includes(getTopBlock)) {
    throw new Error('editable/uni-app/build.js 中未找到待补丁的 getTop H5 分支，请核对 mp-html 版本差异')
  }
  editableBuild = editableBuild.split(getTopBlock).join(patchedGetTopBlock)

  // 3.4 体验补丁（仅 H5）：文字/媒体气泡菜单上游为单行横滑（overflow:scroll +
  // white-space:nowrap），10 个菜单项在窄屏被裁切、需要横向滚动才能看全。H5 端改为
  // flex 换行的图标网格：每项一个 carbon 图标（UnoCSS i-carbon-*，白色 currentColor），
  // 未命中映射的项回退为紧凑文字；菜单完整展示、不出现滚动条。小程序/App 保留上游
  // 文字横滑形态（条件编译剔除）。
  const tipItemLine = '        <view v-for="(item, index) in tooltip.items" v-bind:key="index" class="_tooltip_item" :data-i="index" @tap="_tooltipTap">{{item}}</view>'
  const patchedTipItemLine = '        <view v-for="(item, index) in tooltip.items" v-bind:key="index" class="_tooltip_item" :data-i="index" @tap="_tooltipTap"><!-- #ifdef H5 --><text v-if="_tipIcon(item)" class="_tooltip_icon" :class="_tipIcon(item)"></text><text v-else class="_tooltip_text">{{item}}</text><!-- #endif --><!-- #ifndef H5 -->{{item}}<!-- #endif --></view>'
  if (!editableBuild.includes(tipItemLine)) {
    throw new Error('editable build.js 中未找到气泡菜单模板行，请核对 mp-html 版本差异')
  }
  editableBuild = editableBuild.split(tipItemLine).join(patchedTipItemLine)

  // 注入 _tipIcon 图标映射方法（H5 条件编译，附带尾逗号，非 H5 编译后语法仍合法）
  const colorTapBlock = [
    '    _colorTap(e) {',
    '      this._colorcb(e.currentTarget.dataset.i)',
    '      this.$set(this, \'color\', null)',
    '    },',
  ].join('\r\n')
  const patchedColorTapBlock = [
    colorTapBlock,
    '    // #ifdef H5',
    '    _tipIcon (item) {',
    '      const map = {',
    '        \'大小\': \'i-carbon-text-scale\',',
    '        \'颜色\': \'i-carbon-color-switch\',',
    '        \'斜体\': \'i-carbon-text-italic\',',
    '        \'粗体\': \'i-carbon-text-bold\',',
    '        \'下划线\': \'i-carbon-text-underline\',',
    '        \'居中\': \'i-carbon-text-align-center\',',
    '        \'缩进\': \'i-carbon-text-indent\',',
    '        \'上移\': \'i-carbon-arrow-up\',',
    '        \'下移\': \'i-carbon-arrow-down\',',
    '        \'删除\': \'i-carbon-trash-can\',',
    '        \'换图\': \'i-carbon-image\',',
    '        \'宽度\': \'i-carbon-drag-horizontal\',',
    '        \'超链接\': \'i-carbon-link\',',
    '        \'更换链接\': \'i-carbon-link\',',
    '        \'预览图\': \'i-carbon-view\',',
    '        \'启用预览\': \'i-carbon-view\',',
    '        \'禁用预览\': \'i-carbon-view-off\',',
    '        \'封面\': \'i-carbon-image\',',
    '        \'循环\': \'i-carbon-repeat\',',
    '        \'自动播放\': \'i-carbon-play\'',
    '      }',
    '      return map[item] || \'\'',
    '    },',
    '    // #endif',
  ].join('\r\n')
  if (!editableBuild.includes(colorTapBlock)) {
    throw new Error('editable build.js 中未找到 _colorTap 方法块，请核对 mp-html 版本差异')
  }
  editableBuild = editableBuild.split(colorTapBlock).join(patchedColorTapBlock)

  // 注入 H5 气泡菜单样式：flex 换行网格，覆盖上游的 overflow:scroll / nowrap / 固定高
  const colorItemAnchor = [
    '._color_item {',
    '  display: inline-block;',
  ].join('\r\n')
  const tipGridCss = [
    '/* #ifdef H5 */',
    '/* 气泡菜单：图标网格换行完整显示，不使用横向滚动条（定制补丁） */',
    '._tooltip {',
    '  display: inline-flex;',
    '  flex-wrap: wrap;',
    '  align-items: center;',
    '  justify-content: center;',
    '  height: auto;',
    '  padding: 4px;',
    '  overflow: visible;',
    '  white-space: normal;',
    '  line-height: 1;',
    '}',
    '',
    '._tooltip_item {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: 28px;',
    '  height: 28px;',
    '  padding: 0;',
    '  line-height: 1;',
    '}',
    '',
    '._tooltip_icon {',
    '  font-size: 16px;',
    '  line-height: 1;',
    '}',
    '',
    '._tooltip_text {',
    '  width: auto;',
    '  padding: 0 8px;',
    '  font-size: 12px;',
    '  line-height: 28px;',
    '}',
    '/* #endif */',
    '',
  ].join('\r\n')
  if (!editableBuild.includes(colorItemAnchor)) {
    throw new Error('editable build.js 中未找到 ._color_item 样式锚点，请核对 mp-html 版本差异')
  }
  editableBuild = editableBuild.split(colorItemAnchor).join(tipGridCss + colorItemAnchor)

  // 单行网格高度约 36px（原横滑条 30px），H5 端气泡整体上移 8px，避免压住选中块顶边
  const getTopReturn = '  return top - 30'
  const patchedGetTopReturn = [
    '  // #ifdef H5',
    '  return top - 38',
    '  // #endif',
    '  // #ifndef H5',
    '  return top - 30',
    '  // #endif',
  ].join('\r\n')
  if (editableBuild.split(getTopReturn).length - 1 !== 1) {
    throw new Error('editable build.js 中 getTop return 锚点不唯一，请核对 mp-html 版本差异')
  }
  editableBuild = editableBuild.split(getTopReturn).join(patchedGetTopReturn)

  await fs.writeFile(editableBuildPath, editableBuild)
  console.log('✓ 已补丁 editable getTop 的 H5 坐标取值（修复气泡菜单定位）')
  console.log('✓ 已补丁气泡菜单 H5 图标网格（去滚动条、完整换行显示）')

  // 4. 安装构建链并构建 uni-app 产物
  run('bun', ['install'])
  run('bun', ['run', 'build:uni-app'])

  // 5. 校验产物：插件以独立目录产出并由 mp-html.vue 显式 import
  const entryPath = path.join(buildOutput, 'mp-html.vue')
  const entry = await fs.readFile(entryPath, 'utf8')
  const editableIndex = path.join(buildOutput, 'editable', 'index.js')
  const audioComponent = path.join(buildOutput, 'audio', 'audio.vue')
  const editableCode = await fs.readFile(editableIndex, 'utf8')
  const builtNode = await fs.readFile(path.join(buildOutput, 'node', 'node.vue'), 'utf8')
  const checks = [
    ['mp-html.vue 引用 editable 插件', entry.includes('\'./editable/index.js\'')],
    ['mp-html.vue 引用 audio 插件', entry.includes('\'./audio/index.js\'')],
    ['editable 含 insertHtml 等编辑方法', editableCode.includes('insertHtml') && editableCode.includes('_editVal')],
    ['audio 播放器组件存在', await exists(audioComponent)],
    ['node.vue 空填充已加 H5 条件编译剔除', builtNode.includes('// #ifndef H5') && builtNode.includes('nodes.push({})')],
    ['node.vue getTop 已修复 H5 坐标取值', builtNode.includes('_touch.pageY') && !builtNode.includes('  top = e.pageY\r\n') && !builtNode.includes('  top = e.pageY\n')],
    ['mp-html.vue 气泡菜单已图标网格', entry.includes('_tipIcon') && entry.includes('flex-wrap: wrap')],
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length)
    throw new Error(`产物插件校验失败：${failed.join('、')}，请检查构建输出`)

  // 6. 同步组件到 src/components/mp-html（先清空目标，再整包复制）
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.cp(buildOutput, targetDir, { recursive: true })

  // 7. 同步 App 端静态资源（合并到 src/static，不清空已有资源）
  if (await exists(buildStatic))
    await fs.cp(buildStatic, targetStatic, { recursive: true })

  const countFiles = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true })
    return entries.filter(e => e.isFile()).length
  }
  const fileCount = await countFiles(targetDir)
  console.log(`✓ 组件已同步到 src/components/mp-html/（${fileCount} 个文件）`)
  console.log('✓ App 端静态资源已同步到 src/static/app-plus/')
  console.log('完成：可在页面中以 easycom 方式直接使用 <mp-html>。')
}

main().catch((err) => {
  console.error('\n[vendor:mp-html] 构建失败：', err.message)
  process.exit(1)
})
