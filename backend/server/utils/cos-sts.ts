import qcloudCosSts from 'qcloud-cos-sts'
import { getEnv } from './env'
import { getCosConfig } from './cos'
import { getCosAppId } from './media'

/**
 * STS 临时凭证封装：签发仅允许 PutObject / PostObject 到单个指定 key 的临时密钥。
 * key 级最小授权，不暴露桶内其他对象。
 * PutObject 供浏览器端 XHR 直传；PostObject 供 uniapp uni.uploadFile 表单直传。
 */
export interface ScopedCredential {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  startTime: number
  expiredTime: number
}

export async function getScopedPutCredential(key: string): Promise<ScopedCredential> {
  const cfg = getCosConfig()
  const appId = getCosAppId(cfg.bucket)
  if (!appId) {
    throw createApiError('INTERNAL_ERROR', { message: '存储桶名称格式不正确' })
  }
  const env = getEnv()

  const result = await qcloudCosSts.getCredential({
    secretId: cfg.secretId,
    secretKey: cfg.secretKey,
    region: cfg.region,
    durationSeconds: env.TENCENT_COS_STS_TTL,
    policy: {
      version: '2.0',
      statement: [
        {
          effect: 'allow',
          action: ['name/cos:PutObject', 'name/cos:PostObject'],
          resource: `qcs::cos:${cfg.region}:uid/${appId}:${cfg.bucket}/${key}`,
          principal: { qcs: '*' }
        }
      ]
    }
  })

  return {
    tmpSecretId: result.credentials.tmpSecretId,
    tmpSecretKey: result.credentials.tmpSecretKey,
    sessionToken: result.credentials.sessionToken,
    startTime: result.startTime,
    expiredTime: result.expiredTime
  }
}
