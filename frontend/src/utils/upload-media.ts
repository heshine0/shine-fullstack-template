import type { MediaFileRow, MediaType } from '@/api/media'
import { getMediaCredential, registerMedia } from '@/api/media'
import { buildPostFormFields } from '@/utils/cos-post'

/** 待上传的单个媒体来源：H5 传 file，微信小程序等端传 path。 */
export interface UploadMediaSource {
  type: MediaType
  /** H5 原生 File 对象 */
  file?: File
  /** 小程序等端的本地临时文件路径 */
  path?: string
  /** 文件名（用于申请凭证与登记 metadata.name） */
  name: string
  /** 文件大小（字节） */
  size: number
  /** MIME 类型 */
  contentType: string
  /** 图片宽（px） */
  width?: number
  /** 图片高（px） */
  height?: number
  /** 音视频时长（秒） */
  duration?: number
}

export interface UploadMediaOptions {
  /** 上传进度回调（0-100） */
  onProgress?: (progress: number) => void
}

/**
 * 上传单个媒体文件到 COS 并完成服务端登记（公共方法）。
 * 流程：申请 PostObject 临时凭证 → uni.uploadFile 直传 → /media/register 登记。
 * H5 与微信小程序同构（条件编译区分 files / filePath）。
 * @returns 服务端登记后的 media_file 行
 */
export async function uploadMedia(
  source: UploadMediaSource,
  options: UploadMediaOptions = {},
): Promise<MediaFileRow> {
  const { type, name, size, contentType, width, height, duration } = source

  const cred = await getMediaCredential({
    type,
    contentType,
    size,
    filename: name,
  })

  const fields = buildPostFormFields(cred.credential, cred.bucket, cred.key, contentType)
  const uploadUrl = `https://${cred.bucket}.cos.${cred.region}.myqcloud.com`

  await new Promise<void>((resolve, reject) => {
    let task: ReturnType<typeof uni.uploadFile>
    // #ifdef H5
    task = uni.uploadFile({
      url: uploadUrl,
      name: 'file',
      files: [{ name: 'file', file: source.file! }],
      formData: fields,
      success: res => (res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`))),
      fail: err => reject(new Error(err.errMsg || '上传失败')),
    })
    // #endif
    // #ifdef MP-WEIXIN
    task = uni.uploadFile({
      url: uploadUrl,
      name: 'file',
      filePath: source.path!,
      formData: fields,
      success: res => (res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`))),
      fail: err => reject(new Error(err.errMsg || '上传失败')),
    })
    // #endif
    task.onProgressUpdate((res) => {
      options.onProgress?.(res.progress)
    })
  })

  return registerMedia({
    key: cred.key,
    metadata: {
      name,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(duration ? { duration } : {}),
    },
  })
}
