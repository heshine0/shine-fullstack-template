/**
 * mp-html 定制构建（vendoring）脚本
 *
 * 背景：npm 包 mp-html 的 dist/uni-app 只含基础渲染组件，不含任何插件；
 * audio 等插件必须通过仓库自带 gulp 工具链编入组件包。
 *
 * 流程：
 *   1. 校验 node_modules/mp-html 版本；
 *   2. 整包复制到工作目录 .mp-html-build/；
 *   3. 改写 tools/config.js 的 plugins 列表为 audio；
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
const PLUGINS = ['audio']

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const sourceDir = path.join(frontendRoot, 'node_modules', 'mp-html')
const workDir = path.join(frontendRoot, '.mp-html-build')
const distUniApp = path.join(workDir, 'dist', 'uni-app')
const buildOutput = path.join(distUniApp, 'components', 'mp-html')
const targetDir = path.join(frontendRoot, 'src', 'components', 'mp-html')

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

  // 4. 安装构建链并构建 uni-app 产物
  run('bun', ['install'])
  run('bun', ['run', 'build:uni-app'])

  // 5. 校验产物：插件以独立目录产出并由 mp-html.vue 显式 import
  const entryPath = path.join(buildOutput, 'mp-html.vue')
  const entry = await fs.readFile(entryPath, 'utf8')
  const audioComponent = path.join(buildOutput, 'audio', 'audio.vue')
  const checks = [
    ['mp-html.vue 引用 audio 插件', entry.includes('\'./audio/index.js\'')],
    ['audio 播放器组件存在', await exists(audioComponent)],
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length)
    throw new Error(`产物插件校验失败：${failed.join('、')}，请检查构建输出`)

  // 6. 同步组件到 src/components/mp-html（先清空目标，再整包复制）
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.cp(buildOutput, targetDir, { recursive: true })

  const countFiles = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true })
    return entries.filter(e => e.isFile()).length
  }
  const fileCount = await countFiles(targetDir)
  console.log(`✓ 组件已同步到 src/components/mp-html/（${fileCount} 个文件）`)
  console.log('完成：可在页面中以 easycom 方式直接使用 <mp-html>。')
}

main().catch((err) => {
  console.error('\n[vendor:mp-html] 构建失败：', err.message)
  process.exit(1)
})
