#!/usr/bin/env node
/**
 * 品牌参数化脚本 —— 从本基础模板派生新项目时，一键替换品牌名 / 英文标识 / AppID / 管理员邮箱。
 *
 * 用法：
 *   bun scripts/init-template.mjs                 交互式（逐项提示，回车接受默认值）
 *   bun scripts/init-template.mjs --dry-run       只预览将要发生的改动，不落盘
 *   bun scripts/init-template.mjs --yes \         非交互（CI / 脚本化）
 *     --title "某某协会" --slug my-association \
 *     --uni-appid __UNI__XXXX --wx-appid wxXXXX \
 *     --admin-email admin@example.com
 *   bun scripts/init-template.mjs --help
 *
 * 设计说明：
 * - 仅修改下方显式登记的文件（白名单），不做全仓盲替换，避免误伤 lockfile / 历史文档。
 * - env 文件按键名赋值（幂等，可重复运行）；源码文件按当前模板默认值做字面量替换（一次性派生）。
 * - 不处理二进制资产与密钥：图标、Android 权限、生产域名、COS/微信密钥等见结束后的清单。
 * - 仅依赖 Node 内置模块，Bun 与 Node >= 20 均可运行。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ───────────────────────────── 当前模板默认值（即被替换的旧值） ─────────────────────────────
const DEFAULTS = {
  title: '桐乡武协', // 品牌/应用中文名
  slug: 'tongxiangwuxie', // 英文标识：数据库名、health 服务名等
  uniAppid: '__UNI__D1E5001', // uni-app AppID
  wxAppid: 'wxa2abb91f64032a2b', // 微信小程序 AppID
  adminEmail: 'admin@tongxiangwuxie.local', // 初始管理员邮箱（同时是登录页预填值）
}

// 需要做字面量替换的源码/配置文件（相对仓库根）。顺序即替换顺序，长串在前。
const TEXT_FILES = [
  'frontend/pages.config.ts',
  'frontend/src/layouts/default.vue',
  'frontend/src/pages/me/me.vue',
  'frontend/src/pages/login/index.vue',
  'frontend/src/pages/index/index.vue',
  'backend/app/pages/login.vue',
  'backend/app/pages/dashboard.vue',
  'backend/app/layouts/default.vue',
  'backend/app/app.vue',
  'backend/drizzle.config.ts',
  'backend/server/api/health.get.ts',
  'AGENTS.md',
]

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ───────────────────────────── 参数解析 ─────────────────────────────
function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      if (key === 'dry-run' || key === 'yes' || key === 'help') {
        opts[camel(key)] = true
      }
      else {
        opts[camel(key)] = argv[++i]
      }
    }
    else {
      opts._.push(arg)
    }
  }
  return opts
}
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

const HELP = `品牌参数化脚本

用法:
  bun scripts/init-template.mjs [选项]

选项:
  --title <名称>         品牌/应用中文名（默认：${DEFAULTS.title}）
  --slug <标识>          英文标识，小写字母/数字/连字符（默认：${DEFAULTS.slug}）
  --uni-appid <AppID>    uni-app AppID（默认：${DEFAULTS.uniAppid}）
  --wx-appid <AppID>     微信小程序 AppID（默认：${DEFAULTS.wxAppid}）
  --admin-email <邮箱>   初始管理员邮箱（默认：${DEFAULTS.adminEmail}）
  --dry-run              只预览改动，不写文件
  --yes                  非交互模式（参数需通过选项给全，缺省项取默认值）
  --help                 显示本帮助

示例:
  bun scripts/init-template.mjs
  bun scripts/init-template.mjs --dry-run
  bun scripts/init-template.mjs --yes --title "某某协会" --slug my-association \\
    --uni-appid __UNI__ABC --wx-appid wxabc --admin-email admin@example.com
`

// ───────────────────────────── 交互收集 ─────────────────────────────
async function promptValues(cli) {
  if (cli.yes) {
    return {
      title: cli.title ?? DEFAULTS.title,
      slug: cli.slug ?? DEFAULTS.slug,
      uniAppid: cli.uniAppid ?? DEFAULTS.uniAppid,
      wxAppid: cli.wxAppid ?? DEFAULTS.wxAppid,
      adminEmail: cli.adminEmail ?? DEFAULTS.adminEmail,
    }
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = async (label, key) => {
    const answer = (await rl.question(`${label} [${DEFAULTS[key]}]：`)).trim()
    return answer || DEFAULTS[key]
  }
  try {
    console.log('品牌参数化（回车保留方括号中的当前值）\n')
    const values = {
      title: await ask('品牌/应用中文名', 'title'),
      slug: await ask('英文标识（小写字母/数字/连字符，用作数据库名等）', 'slug'),
      uniAppid: await ask('uni-app AppID', 'uniAppid'),
      wxAppid: await ask('微信小程序 AppID（不做小程序可先保留占位）', 'wxAppid'),
      adminEmail: await ask('初始管理员邮箱（登录页预填值 + backend/.env）', 'adminEmail'),
    }
    return values
  }
  finally {
    rl.close()
  }
}

// ───────────────────────────── 校验 ─────────────────────────────
function validate(v) {
  const errors = []
  if (!v.title.trim())
    errors.push('品牌名不能为空')
  if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/.test(v.slug))
    errors.push(`slug 只能包含小写字母、数字、连字符，且不能以连字符开头/结尾：${v.slug}`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.adminEmail))
    errors.push(`管理员邮箱格式不正确：${v.adminEmail}`)
  if (!v.uniAppid.trim() || !v.wxAppid.trim())
    errors.push('AppID 不能为空（暂无正式 AppID 可保留占位值）')
  return errors
}

// ───────────────────────────── 替换原语 ─────────────────────────────
/** 统计并全局替换字面量；返回 [新内容, 命中次数] */
function replaceLiteral(content, from, to) {
  if (from === to)
    return [content, 0]
  const parts = content.split(from)
  return [parts.join(to), parts.length - 1]
}

/** 按键名设置 env 值；完整保留原有等号空白与引号风格，值未变时内容逐字节不变 */
function setEnvVar(content, key, value) {
  const re = new RegExp(`^(${key})(\\s*=\\s*)(['"]?)([^'"\\r\\n]*?)\\3(?=\\s*$)`, 'm')
  if (re.test(content)) {
    return content.replace(re, (_m, head, sep, quote) => `${head}${sep}${quote}${value}${quote}`)
  }
  return `${content.trimEnd()}\n${key}=${value}\n`
}

/** 仅替换 DATABASE_URL 末尾的数据库名（用户名/密码/主机端口保持不动） */
function setDbName(content, dbName) {
  const re = /^(DATABASE_URL=postgresql(?:s)?:\/\/[^/\n]+\/)[^?\s]+/m
  return content.replace(re, `$1${dbName}`)
}

function abs(rel) {
  return resolve(ROOT, rel)
}

// ───────────────────────────── 主流程 ─────────────────────────────
async function main() {
  const cli = parseArgs(process.argv.slice(2))
  if (cli.help) {
    console.log(HELP)
    return
  }
  if (!existsSync(resolve(ROOT, 'frontend')) || !existsSync(resolve(ROOT, 'backend'))) {
    console.error(`✗ 未在仓库根找到 frontend/ 与 backend/，请从仓库根运行本脚本（当前根：${ROOT}）`)
    process.exit(1)
  }

  const values = await promptValues(cli)
  const errors = validate(values)
  if (errors.length) {
    console.error('✗ 参数校验失败：')
    for (const e of errors)
      console.error(`  - ${e}`)
    process.exit(1)
  }

  // 字面量替换对（顺序敏感：邮箱、复合串必须排在短串之前）
  const pairs = [
    [DEFAULTS.adminEmail, values.adminEmail],
    [`${DEFAULTS.slug}-backend`, `${values.slug}-backend`],
    [DEFAULTS.title, values.title],
    [DEFAULTS.uniAppid, values.uniAppid],
    [DEFAULTS.wxAppid, values.wxAppid],
    [DEFAULTS.slug, values.slug],
  ]

  const plan = [] // {file, changes: string[], missing?}

  // 1) env 文件：按键名赋值
  const frontendEnv = 'frontend/env/.env'
  if (existsSync(abs(frontendEnv))) {
    let c = readFileSync(abs(frontendEnv), 'utf8')
    const before = c
    c = setEnvVar(c, 'VITE_APP_TITLE', values.title)
    c = setEnvVar(c, 'VITE_UNI_APPID', values.uniAppid)
    c = setEnvVar(c, 'VITE_WX_APPID', values.wxAppid)
    plan.push({ file: frontendEnv, content: c, changed: c !== before })
  }
  else {
    plan.push({ file: frontendEnv, missing: true })
  }

  for (const envFile of ['backend/.env.example', 'backend/.env']) {
    if (!existsSync(abs(envFile))) {
      if (envFile === 'backend/.env')
        continue // .env 入库忽略，不存在属正常
      plan.push({ file: envFile, missing: true })
      continue
    }
    let c = readFileSync(abs(envFile), 'utf8')
    const before = c
    c = setDbName(c, values.slug)
    c = setEnvVar(c, 'ADMIN_EMAIL', values.adminEmail)
    plan.push({ file: envFile, content: c, changed: c !== before })
  }

  // 2) 源码/配置文件：字面量替换
  for (const rel of TEXT_FILES) {
    if (!existsSync(abs(rel))) {
      plan.push({ file: rel, missing: true })
      continue
    }
    let c = readFileSync(abs(rel), 'utf8')
    const details = []
    for (const [from, to] of pairs) {
      const [next, count] = replaceLiteral(c, from, to)
      if (count > 0)
        details.push(`${from} → ${to}（${count} 处）`)
      c = next
    }
    plan.push({ file: rel, content: c, changes: details, changed: details.length > 0 })
  }

  // ── 预览 ──
  console.log('\n──────────────── 改动预览 ────────────────')
  let totalChanged = 0
  for (const item of plan) {
    if (item.missing) {
      console.log(`! 跳过（文件不存在）：${item.file}`)
      continue
    }
    if (!item.changed) {
      console.log(`· 无改动：${item.file}`)
      continue
    }
    totalChanged++
    console.log(`✎ ${item.file}`)
    if (item.changes)
      for (const d of item.changes)
        console.log(`    ${d}`)
    else
      console.log('    env 变量已更新')
  }

  if (totalChanged === 0) {
    console.log('\n所有参数与当前模板值一致，无需修改。')
    return
  }

  if (cli.dryRun) {
    console.log('\n[dry-run] 未写入任何文件。确认无误后去掉 --dry-run 重新运行。')
    return
  }
  if (!cli.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ok = (await rl.question('\n确认写入以上修改？(y/N)：')).trim().toLowerCase()
    rl.close()
    if (ok !== 'y' && ok !== 'yes') {
      console.log('已取消。')
      return
    }
  }

  for (const item of plan) {
    if (!item.missing && item.changed)
      writeFileSync(abs(item.file), item.content, 'utf8')
  }
  console.log(`\n✓ 已更新 ${totalChanged} 个文件。`)

  console.log(`
──────────────── 仍需手动处理 ────────────────
1. 应用图标：frontend/src/static/app/icons/* 与 frontend/src/static/logo.svg
2. manifest.config.ts：应用描述、Android 权限清单（模板默认权限偏宽，上架前收窄）
3. 环境与密钥：
   - backend/.env：BETTER_AUTH_SECRET、ADMIN_PASSWORD、WECHAT_*、TENCENT_COS_*（勿入库）
   - frontend/env/.env.production / .env.test：生产/测试域名与 VITE_SERVER_BASEURL__WEIXIN_*
   - 若 slug 已改，本地需新建数据库：CREATE DATABASE ${values.slug}; 再执行 bun run db:migrate / db:seed
4. TRUSTED_ORIGINS（backend/.env）：如前端/后端端口有变化需同步
5. 工程元信息：两个 package.json 的 name/description/repository、LICENSE、git remote
6. AGENTS.md 中与品牌无关的路径/约定按需调整
`)
}

main().catch((err) => {
  console.error('✗ 执行失败：', err)
  process.exit(1)
})
