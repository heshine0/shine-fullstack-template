import { createMediaFile, getMediaFileByUrl } from '../../database/repositories/media'
import { getCosConfig, headCosObject } from '../../utils/cos'
import { getEnv } from '../../utils/env'
import {
  MEDIA_TYPE_CONFIG,
  buildObjectUrl,
  mimeMatchesType,
  parseObjectKey,
  type MediaMetadata
} from '../../utils/media'
import { registerBodySchema } from '../../schemas/media'

/**
 * 直传完成后登记媒体（登录用户）。
 * 服务端 headObject 权威核实对象存在、MIME 类别与大小合规，再写入 media_file；
 * 重复登记同一对象幂等返回已有行。
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = await parseBody(event, registerBodySchema)
  const { key, metadata: clientMeta } = body

  const parsed = parseObjectKey(key)
  if (!parsed) throw createApiError('NOT_FOUND')

  const head = await headCosObject(key)
  if (!head) throw createApiError('NOT_FOUND', { message: '上传对象不存在' })

  const { type } = parsed
  if (!mimeMatchesType(type, head.contentType)) {
    throw createApiError('VALIDATION_ERROR', { message: '对象 MIME 与 key 类型不一致' })
  }
  if (head.contentLength > MEDIA_TYPE_CONFIG[type].maxBytes) {
    throw createApiError('VALIDATION_ERROR', { message: '对象大小超过限制' })
  }

  const { bucket, region } = getCosConfig()
  const url = buildObjectUrl(bucket, region, key, getEnv().TENCENT_COS_DOMAIN)

  const existing = await getMediaFileByUrl(url)
  if (existing) return ok(existing)

  const metadata: MediaMetadata = {
    key,
    bucket,
    region,
    ...(head.contentType ? { mimeType: head.contentType } : {}),
    ...(head.contentLength ? { size: head.contentLength } : {}),
    ...(head.etag ? { etag: head.etag } : {}),
    ...(clientMeta?.name ? { name: clientMeta.name } : {}),
    ...(clientMeta?.width ? { width: clientMeta.width } : {}),
    ...(clientMeta?.height ? { height: clientMeta.height } : {}),
    ...(clientMeta?.duration ? { duration: clientMeta.duration } : {})
  }

  const row = await createMediaFile({ url, type, metadata })
  return ok(row)
})
