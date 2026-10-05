/**
 * 通用媒体（media_file）纯逻辑：类型注册表、MIME 类别判定、
 * COS key 生成与严格解析、URL 拼装、文件名清洗。
 * 不触碰 IO，便于单测。
 */

export type MediaType = 'image' | 'video' | 'audio' | 'file'

export const MEDIA_TYPES = ['image', 'video', 'audio', 'file'] as const

/** media_file.metadata jsonb 的结构（键均可缺省）。 */
export interface MediaMetadata {
  /** COS 对象键 */
  key?: string
  bucket?: string
  region?: string
  /** 服务端 headObject 权威 MIME */
  mimeType?: string
  /** 服务端 headObject 权威字节数 */
  size?: number
  etag?: string
  /** 客户端上报：原始文件名 */
  name?: string
  width?: number
  height?: number
  /** 音视频时长（秒） */
  duration?: number
  [key: string]: unknown
}

interface MediaTypeConfig {
  /** COS key 前缀 */
  prefix: string
  /** 大小上限（字节） */
  maxBytes: number
}

/**
 * 各类型 key 前缀与大小上限。
 * 前缀与类型一一对应，作为 key 合法性的判据之一。
 */
export const MEDIA_TYPE_CONFIG: Record<MediaType, MediaTypeConfig> = {
  image: { prefix: 'images/', maxBytes: 10 * 1024 * 1024 },
  video: { prefix: 'videos/', maxBytes: 500 * 1024 * 1024 },
  audio: { prefix: 'audio/', maxBytes: 50 * 1024 * 1024 },
  file: { prefix: 'files/', maxBytes: 50 * 1024 * 1024 }
}

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === 'string' && (MEDIA_TYPES as readonly string[]).includes(value)
}

/**
 * 由 MIME 判定媒体类别：image/* / video/* / audio/* 对应归类，其余一律 file。
 * MIME 缺失时归 file。
 */
export function getMimeCategory(mime: string | undefined | null): MediaType {
  const m = mime?.trim().toLowerCase()
  if (!m) return 'file'
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return 'file'
}

/** MIME 类别是否与指定类型一致（type=file 时放行非 image/video/audio 的所有 MIME）。 */
export function mimeMatchesType(type: MediaType, mime: string | undefined | null): boolean {
  return getMimeCategory(mime) === type
}

/** 常见 MIME → 扩展名映射（无法识别时返回 null，key 不带扩展名）。 */
const MIME_TO_EXT: Record<string, string> = {
  // image
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  // video
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  // audio
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  // file
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt'
}

export function extFromMime(mime: string | undefined | null): string | null {
  const m = mime?.trim().toLowerCase()
  if (!m) return null
  return MIME_TO_EXT[m] ?? null
}

/**
 * 生成 COS 对象键：`<prefix><uuid>.<ext>`。
 * 服务端生成随机 UUID，客户端无法预测或覆盖他人对象。
 */
export function buildObjectKey(type: MediaType, ext?: string | null): string {
  const { prefix } = MEDIA_TYPE_CONFIG[type]
  const safeExt = ext && /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : ''
  return `${prefix}${crypto.randomUUID()}${safeExt}`
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

export interface ParsedObjectKey {
  type: MediaType
  id: string
  ext: string | null
}

/**
 * 严格解析对象键：`<prefix><uuid>[.<ext>]`。
 * 前缀必须与某类型注册前缀完全一致；不匹配（含 `../`、伪造前缀、非 uuid）返回 null。
 */
export function parseObjectKey(key: string): ParsedObjectKey | null {
  for (const type of MEDIA_TYPES) {
    const { prefix } = MEDIA_TYPE_CONFIG[type]
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const match = new RegExp(`^(${UUID_RE.source})(?:\\.([a-z0-9]{1,8}))?$`).exec(rest)
    if (!match) return null
    return { type, id: match[1]!, ext: match[2] ?? null }
  }
  return null
}

/**
 * 从存储桶名解析 AppID：bucket 形如 `name-1250000000`，取末尾数字段。
 * 不合法返回 null。
 */
export function getCosAppId(bucket: string): string | null {
  const idx = bucket.lastIndexOf('-')
  if (idx <= 0) return null
  const appId = bucket.slice(idx + 1)
  return /^\d{5,}$/.test(appId) ? appId : null
}

/**
 * 拼装对象公开访问 URL：
 * - 配置了 CDN/自定义域名时用域名；
 * - 否则用 COS 默认域名 `https://<bucket>.cos.<region>.myqcloud.com/<encodedKey>`。
 */
export function buildObjectUrl(
  bucket: string,
  region: string,
  key: string,
  customDomain?: string | null
): string {
  const domain = customDomain?.trim().replace(/\/+$/, '')
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  if (domain) {
    return /^https?:\/\//.test(domain) ? `${domain}/${encodedKey}` : `https://${domain}/${encodedKey}`
  }
  return `https://${bucket}.cos.${region}.myqcloud.com/${encodedKey}`
}

/** 清洗原始文件名：去路径成分与控制字符，截断到 maxLen。 */
export function sanitizeFileName(name: string, maxLen = 200): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = Array.from(base)
    .filter((ch) => {
      const code = ch.codePointAt(0)!
      return code > 0x1F && code !== 0x7F
    })
    .join('')
    .trim()
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned
}
