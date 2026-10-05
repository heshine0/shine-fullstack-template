import { http } from '@/http/alova'

export type MediaType = 'image' | 'video' | 'audio' | 'file'

/** media_file.metadata jsonb 的结构（键均可缺省）。 */
export interface MediaMetadata {
  key?: string
  bucket?: string
  region?: string
  mimeType?: string
  size?: number
  etag?: string
  name?: string
  width?: number
  height?: number
  duration?: number
  [key: string]: unknown
}

/** media_file 行（与后端 MediaFileRow 对齐，列名为 camelCase）。 */
export interface MediaFileRow {
  id: string
  url: string
  type: MediaType
  refCount: number
  metadata: MediaMetadata
  createdAt: string
}

/** POST /api/media/credentials 返回的临时凭证。 */
export interface ScopedCredential {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  startTime: number
  expiredTime: number
}

export interface UploadCredentialResult {
  credential: ScopedCredential
  bucket: string
  region: string
  key: string
  url: string
}

export interface CredentialRequestBody {
  type: MediaType
  contentType: string
  size?: number
  filename?: string
}

/** 申请 COS 直传临时凭证（key 级最小授权）。 */
export function getMediaCredential(data: CredentialRequestBody): Promise<UploadCredentialResult> {
  return http.Post('/media/credentials', data) as unknown as Promise<UploadCredentialResult>
}

export interface RegisterRequestBody {
  key: string
  metadata?: Pick<MediaMetadata, 'name' | 'width' | 'height' | 'duration'>
}

/** 组件内部使用的媒体项（含上传态）。 */
export interface MediaItem {
  id: string
  url: string
  type: MediaType
  metadata: MediaMetadata
  status?: 'uploading' | 'done' | 'error'
  progress?: number
  errorMessage?: string
}

/** 直传完成后登记媒体（服务端 headObject 权威核实，按 url 幂等）。 */
export function registerMedia(data: RegisterRequestBody): Promise<MediaFileRow> {
  return http.Post('/media/register', data) as unknown as Promise<MediaFileRow>
}
