import { z } from 'zod'

/**
 * 分页/排序约定。
 * page >= 1（默认 1），pageSize 1..100（默认 20）。
 */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export interface PaginationInput {
  page: number
  pageSize: number
}

export interface ParsedPagination extends PaginationInput {
  /** SQL LIMIT */
  limit: number
  /** SQL OFFSET */
  offset: number
}

export function parsePagination(input: unknown): ParsedPagination {
  const { page, pageSize } = pageQuerySchema.parse(input ?? {})
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize }
}

/** 通用关键字查询参数：keyword 可选，trim 后 1..50 字符。 */
export const keywordQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(50).optional()
})

/** 组装分页元信息。 */
export function buildPaginationMeta(
  total: number,
  input: PaginationInput
): { page: number, pageSize: number, total: number } {
  return { page: input.page, pageSize: input.pageSize, total }
}
