/**
 * 统一成功响应封装。
 *
 * 单资源/操作：{ code: 'OK', data, message? }
 * 分页列表：  { code: 'OK', data, pagination: { page, pageSize, total, totalPages } }
 */

export interface ApiSuccess<T> {
  code: 'OK'
  data: T
  message?: string
}

export function ok<T>(data: T, message?: string): ApiSuccess<T> {
  return message ? { code: 'OK', data, message } : { code: 'OK', data }
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PaginatedSuccess<T> {
  code: 'OK'
  data: T
  pagination: PaginationMeta
}

export function paginated<T>(
  data: T,
  meta: { page: number, pageSize: number, total: number }
): PaginatedSuccess<T> {
  const { page, pageSize, total } = meta
  return {
    code: 'OK',
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  }
}
