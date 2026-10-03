/**
 * 小程序/App 端 Cookie 罐（H5 不使用：浏览器同源请求自动携带 Cookie）。
 *
 * 小程序原生网络层不会可靠透传 Set-Cookie，因此：
 * - 每次响应后从 Set-Cookie 头解析并合并写入 uni.storage
 * - 每次请求前拼出 Cookie 头带上
 * Better Auth 会话轮换时会重新下发 Set-Cookie，罐内按 name 覆盖即可保持最新。
 */

const STORAGE_KEY = 'auth-cookies'
/** 只持久化 Better Auth 自己写入的 Cookie，避免污染/膨胀本地存储。 */
const COOKIE_NAME_ALLOWLIST = /^better-auth(?:[.-]|$)/

interface StoredCookie {
  name: string
  value: string
  /** 毫秒时间戳；会话级 Cookie（无 expires）为 0。 */
  expiresAt: number
}

type HeaderBag = Record<string, string | string[] | undefined> | undefined

function readAll(): StoredCookie[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  }
  catch {
    return []
  }
}

function writeAll(list: StoredCookie[]) {
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list))
}

/**
 * 拆分一个可能包含多条 Set-Cookie 的响应头。
 * 各条 Cookie 之间以 ', name=' 分隔（Expires 里的逗号后面不会紧跟 'token=' 形态）。
 */
function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[^\s=;,]+\s*=)/g)
    .map(s => s.trim())
    .filter(Boolean)
}

function parseSetCookie(chunk: string): StoredCookie | null {
  const segments = chunk.split(';').map(s => s.trim()).filter(Boolean)
  const first = segments.shift()
  if (!first || !first.includes('='))
    return null

  const eqIndex = first.indexOf('=')
  const name = first.slice(0, eqIndex).trim()
  const value = first.slice(eqIndex + 1).trim()
  if (!COOKIE_NAME_ALLOWLIST.test(name))
    return null

  let expiresAt = 0
  for (const seg of segments) {
    const attrEq = seg.indexOf('=')
    const attrName = (attrEq === -1 ? seg : seg.slice(0, attrEq)).trim().toLowerCase()
    if (attrName === 'expires' && attrEq !== -1) {
      const t = Date.parse(seg.slice(attrEq + 1).trim())
      if (!Number.isNaN(t))
        expiresAt = t
    }
    // max-age 优先级高于 expires
    if (attrName === 'max-age' && attrEq !== -1) {
      const seconds = Number(seg.slice(attrEq + 1).trim())
      if (Number.isFinite(seconds))
        expiresAt = seconds <= 0 ? 0 : Date.now() + seconds * 1000
    }
  }

  return { name, value, expiresAt }
}

export const cookieJar = {
  /** 从 uni.request 响应头中提取并合并 Set-Cookie。 */
  saveFromResponseHeaders(headers: HeaderBag) {
    if (!headers)
      return
    const rawChunks: string[] = []
    for (const [key, val] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'set-cookie' || val == null)
        continue
      if (Array.isArray(val))
        rawChunks.push(...val)
      else rawChunks.push(...splitSetCookieHeader(String(val)))
    }
    if (!rawChunks.length)
      return

    const now = Date.now()
    const merged = new Map<string, StoredCookie>()
    for (const c of readAll()) {
      if (!c.expiresAt || c.expiresAt > now)
        merged.set(c.name, c)
    }
    for (const chunk of rawChunks) {
      const parsed = parseSetCookie(chunk)
      if (!parsed)
        continue
      // value 为空且已过期：删除该 Cookie
      if (parsed.expiresAt !== 0 && parsed.expiresAt <= now)
        merged.delete(parsed.name)
      else merged.set(parsed.name, parsed)
    }
    writeAll(Array.from(merged.values()))
  },

  /** 拼请求用 Cookie 头；无有效 Cookie 时返回空串。 */
  getCookieHeader(): string {
    const now = Date.now()
    const valid = readAll().filter(c => !c.expiresAt || c.expiresAt > now)
    return valid.map(c => `${c.name}=${c.value}`).join('; ')
  },

  clear() {
    try {
      uni.removeStorageSync(STORAGE_KEY)
    }
    catch {
      // 忽略存储不可用
    }
  },
}
