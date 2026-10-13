import CryptoJS from 'crypto-js'

type MediaType = 'image' | 'video' | 'audio'

interface ScopedCredential {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  startTime: number
  expiredTime: number
}

interface CredentialResponse {
  credential: ScopedCredential
  bucket: string
  region: string
  key: string
  url: string
}

interface MediaMetadata {
  name?: string
  width?: number
  height?: number
  duration?: number
}

export interface UploadResult {
  url: string
  metadata: MediaMetadata
}

const MEDIA_LIMITS: Record<MediaType, number> = {
  image: 10 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio: 50 * 1024 * 1024
}

async function getMediaCredential(type: MediaType, file: File): Promise<CredentialResponse> {
  return await $fetch<CredentialResponse>('/api/media/credentials', {
    method: 'POST',
    body: { type, contentType: file.type, size: file.size, filename: file.name },
    credentials: 'include'
  })
}

function buildPostFormFields(
  credential: ScopedCredential,
  bucket: string,
  key: string,
  contentType?: string
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
      ['starts-with', '$key', key]
    ]
  }
  const policyB64 = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(JSON.stringify(policy))
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
    ...(contentType ? { 'Content-Type': contentType } : {})
  }
}

async function registerMedia(key: string, metadata: MediaMetadata): Promise<void> {
  await $fetch('/api/media/register', {
    method: 'POST',
    body: { key, metadata },
    credentials: 'include'
  })
}

function loadImageDimensions(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({})
    img.src = URL.createObjectURL(file)
  })
}

function loadVideoMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.onloadedmetadata = () =>
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
    video.onerror = () => resolve({})
    video.src = URL.createObjectURL(file)
  })
}

function loadAudioMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    audio.onloadedmetadata = () => resolve({ duration: audio.duration })
    audio.onerror = () => resolve({})
    audio.src = URL.createObjectURL(file)
  })
}

/** 浏览器直传 COS 并登记媒体。 */
export async function uploadMediaFile(file: File, type: MediaType): Promise<UploadResult> {
  if (file.size > MEDIA_LIMITS[type]) {
    const maxMb = MEDIA_LIMITS[type] / 1024 / 1024
    throw new Error(`文件大小超过限制（最大 ${maxMb}MB）`)
  }

  const { credential, bucket, region, key, url } = await getMediaCredential(type, file)

  const formFields = buildPostFormFields(credential, bucket, key, file.type)
  const formData = new FormData()
  for (const [k, v] of Object.entries(formFields)) {
    formData.append(k, v)
  }
  formData.append('file', file)

  const uploadUrl = `https://${bucket}.cos.${region}.myqcloud.com/`
  const resp = await fetch(uploadUrl, { method: 'POST', body: formData })
  if (!resp.ok) throw new Error('上传到对象存储失败')

  const metadata: MediaMetadata = { name: file.name }
  if (type === 'image') Object.assign(metadata, await loadImageDimensions(file))
  else if (type === 'video') Object.assign(metadata, await loadVideoMetadata(file))
  else if (type === 'audio') Object.assign(metadata, await loadAudioMetadata(file))

  await registerMedia(key, metadata)
  return { url, metadata }
}
