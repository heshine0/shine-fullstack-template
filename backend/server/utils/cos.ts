import COS from 'cos-nodejs-sdk-v5'
import { getEnv } from './env'

/**
 * COS 服务端封装（永久密钥，仅后端使用）。
 * 未配置密钥/桶时抛统一错误；不影响应用启动。
 */

export interface CosRuntimeConfig {
  secretId: string
  secretKey: string
  bucket: string
  region: string
}

let cosClient: COS | null = null

/** 读取并校验 COS 运行配置；缺失时抛 INTERNAL_ERROR。 */
export function getCosConfig(): CosRuntimeConfig {
  const env = getEnv()
  const secretId = env.TENCENT_COS_SECRET_ID?.trim()
  const secretKey = env.TENCENT_COS_SECRET_KEY?.trim()
  const bucket = env.TENCENT_COS_BUCKET?.trim()
  if (!secretId || !secretKey || !bucket) {
    throw createApiError('INTERNAL_ERROR', { message: '对象存储未配置' })
  }
  return { secretId, secretKey, bucket, region: env.TENCENT_COS_REGION }
}

export function getCosClient(): COS {
  if (!cosClient) {
    const cfg = getCosConfig()
    cosClient = new COS({ SecretId: cfg.secretId, SecretKey: cfg.secretKey })
  }
  return cosClient
}

export interface HeadCosResult {
  contentLength: number
  contentType: string
  etag: string
}

/** HEAD 对象：返回服务端权威大小/MIME/ETag；对象不存在返回 null。 */
export async function headCosObject(key: string): Promise<HeadCosResult | null> {
  const cfg = getCosConfig()
  try {
    const data = await getCosClient().headObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key
    })
    const headers = data.headers ?? {}
    const etag = (data.ETag ?? String(headers.etag ?? '')).replaceAll('"', '')
    return {
      contentLength: Number(headers['content-length'] ?? 0),
      contentType: String(headers['content-type'] ?? ''),
      etag
    }
  } catch (err) {
    if ((err as COS.CosSdkError).statusCode === 404) return null
    throw err
  }
}

/** 删除对象；对象已不存在（404）视为成功，保证删除流程可重试。 */
export async function deleteCosObject(key: string): Promise<void> {
  const cfg = getCosConfig()
  try {
    await getCosClient().deleteObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key
    })
  } catch (err) {
    if ((err as COS.CosSdkError).statusCode === 404) return
    throw err
  }
}
