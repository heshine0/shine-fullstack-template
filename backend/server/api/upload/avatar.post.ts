import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AVATAR_MAX_BYTES,
  avatarUploadDir,
  buildAvatarFileName,
  resolveAvatarExt
} from '../../utils/upload'

/**
 * 上传当前登录用户头像（受认证中间件保护）。
 * multipart 字段名：file；仅接受 jpg/png/webp，≤2MB。
 * 返回图片的公开相对 URL，由前端再调 Better Auth update-user 写入 image 字段。
 */
export default defineEventHandler(async (event) => {
  const currentUser = requireUser(event)

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file')
  if (!file?.data?.length) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少上传文件（字段名 file）' })
  }

  // 以服务端探测的 MIME 为准，不信任客户端扩展名
  const ext = resolveAvatarExt(file.type)
  if (!ext) {
    throw createApiError('VALIDATION_ERROR', { message: '仅支持 jpg、png、webp 格式的图片' })
  }
  if (file.data.length > AVATAR_MAX_BYTES) {
    throw createApiError('VALIDATION_ERROR', { message: '图片大小不能超过 2MB' })
  }

  const fileName = buildAvatarFileName(currentUser.id, ext)
  const dir = avatarUploadDir()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, fileName), file.data)

  return ok({ url: `/api/uploads/avatars/${fileName}` })
})
