import { credentialBodySchema } from '../../schemas/media'
import { getScopedPutCredential } from '../../utils/cos-sts'
import { getCosConfig } from '../../utils/cos'
import { getEnv } from '../../utils/env'
import {
  MEDIA_TYPE_CONFIG,
  buildObjectKey,
  extFromMime,
  mimeMatchesType
} from '../../utils/media'

/**
 * 申请 COS 直传临时凭证（登录用户）。
 * 服务端生成随机 key，签发仅允许 PutObject 到该 key 的临时凭证。
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = await parseBody(event, credentialBodySchema)
  const { type, contentType, size } = body

  if (!mimeMatchesType(type, contentType)) {
    throw createApiError('VALIDATION_ERROR', {
      message: `文件 MIME 与申请类型 ${type} 不匹配`
    })
  }
  if (size !== undefined && size > MEDIA_TYPE_CONFIG[type].maxBytes) {
    throw createApiError('VALIDATION_ERROR', { message: '文件大小超过限制' })
  }

  const key = buildObjectKey(type, extFromMime(contentType))

  let credential
  try {
    credential = await getScopedPutCredential(key)
  } catch (err) {
    // 统一错误（如未配置）原样透传；其余记日志并返回 500
    if (err instanceof Error && 'data' in err) throw err
    logError(event, '获取 COS 临时凭证失败', { err: String(err), key })
    throw createApiError('INTERNAL_ERROR', { message: '获取上传凭证失败' })
  }

  const { bucket, region } = getCosConfig()
  const url = buildObjectUrl(bucket, region, key, getEnv().TENCENT_COS_DOMAIN)

  return ok({ credential, bucket, region, key, url })
})
