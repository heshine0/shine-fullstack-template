import {
  deleteMediaFileById,
  getMediaFileById
} from '../../../database/repositories/media'
import { mediaIdParamSchema } from '../../../schemas/media'
import { deleteCosObject } from '../../../utils/cos'
import type { MediaMetadata } from '../../../utils/media'

/**
 * 删除媒体（admin）。
 * 引用护栏：ref_count > 0 拒绝删除（409）；
 * 先删 COS 对象（404 容忍），再删 DB 行。
 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, mediaIdParamSchema)

  const row = await getMediaFileById(id)
  if (!row) throw createApiError('NOT_FOUND', { message: '媒体不存在' })
  if (row.refCount > 0) {
    throw createApiError('CONFLICT', { message: '该媒体仍被引用，无法删除' })
  }

  const key = (row.metadata as MediaMetadata).key
  if (key) {
    await deleteCosObject(key)
  }
  await deleteMediaFileById(id)

  return ok({ id }, '媒体已删除')
})
