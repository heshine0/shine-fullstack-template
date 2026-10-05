import { join } from 'node:path'

/**
 * 头像上传相关的纯逻辑（便于单测）：
 * - 仅信任服务端白名单内的图片 MIME，扩展名由 MIME 推导（不采信客户端文件名）
 * - 落盘文件名由服务端生成；读取侧再用正则 + 目录归属双重校验防路径穿越
 */

export type AvatarExt = 'jpg' | 'png' | 'webp'

/** 头像落盘目录（后端本地磁盘存储；未来替换为对象存储时仅改上传/读取两处）。 */
export function avatarUploadDir(): string {
  return join(process.cwd(), 'uploads', 'avatars')
}

/** 头像大小上限：2MB。 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

const MIME_TO_EXT: Record<string, AvatarExt> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

/** 静态读取时按扩展名回写 Content-Type。 */
export const AVATAR_MIME_BY_EXT: Record<AvatarExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

/** 允许的文件名：字母数字下划线连字符 + 小写图片扩展名。 */
const SAFE_AVATAR_NAME_RE = /^[A-Za-z0-9_-]+\.(jpg|png|webp)$/

/** 由上传文件的 MIME 推导安全扩展名；不支持时返回 null。 */
export function resolveAvatarExt(mime: string | undefined | null): AvatarExt | null {
  if (!mime) return null
  return MIME_TO_EXT[mime.toLowerCase()] ?? null
}

/**
 * 生成落盘文件名：`<净化后的 userId>-<时间戳>.<ext>`。
 * userId 仅保留白名单字符，避免污染路径。
 */
export function buildAvatarFileName(userId: string, ext: AvatarExt): string {
  const safeId = userId.replace(/[^A-Za-z0-9_-]/g, '')
  return `${safeId}-${Date.now()}.${ext}`
}

/** 校验读取参数中的文件名，拒绝路径穿越与非图片文件。 */
export function isSafeAvatarFileName(name: string): boolean {
  return SAFE_AVATAR_NAME_RE.test(name)
}
