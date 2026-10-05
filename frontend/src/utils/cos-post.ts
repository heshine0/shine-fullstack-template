import CryptoJS from 'crypto-js'
import type { ScopedCredential } from '@/api/media'

/**
 * 构造 COS PostObject（multipart 表单上传）所需的签名字段。
 * 适用于 uni.uploadFile：H5 / 微信小程序同构。
 * 依据腾讯云 POST Object 文档：
 * - policy 为 Base64 编码的策略 JSON；
 * - SignKey = HmacSHA1(KeyTime, TmpSecretKey)；
 * - Signature = HmacSHA1(policyBase64, SignKey)；
 * - 临时凭证必带 x-cos-security-token。
 */
export function buildPostFormFields(
  credential: ScopedCredential,
  bucket: string,
  key: string,
  contentType?: string,
): Record<string, string> {
  const keyTime = `${credential.startTime};${credential.expiredTime}`

  const policy = {
    expiration: new Date(credential.expiredTime * 1000).toISOString(),
    conditions: [
      { 'q-sign-algorithm': 'sha1' },
      { 'q-ak': credential.tmpSecretId },
      { 'q-sign-time': keyTime },
      { 'q-key-time': keyTime },
      { 'q-header-list': '' },
      { 'q-url-param-list': '' },
      { bucket },
      ['starts-with', '$key', key],
    ],
  }

  const policyB64 = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(JSON.stringify(policy)),
  )
  const signKey = CryptoJS.HmacSHA1(keyTime, credential.tmpSecretKey).toString()
  const signature = CryptoJS.HmacSHA1(policyB64, signKey).toString()

  return {
    key,
    'policy': policyB64,
    'q-sign-algorithm': 'sha1',
    'q-ak': credential.tmpSecretId,
    'q-key-time': keyTime,
    'q-signature': signature,
    'x-cos-security-token': credential.sessionToken,
    'success_action_status': '200',
    ...(contentType ? { 'Content-Type': contentType } : {}),
  }
}
