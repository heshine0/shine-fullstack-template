/** 从 $fetch 抛出的统一错误体中提取可读信息。 */
export function apiErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  const e = err as { data?: { message?: string }, statusMessage?: string, message?: string }
  return e?.data?.message || e?.statusMessage || e?.message || fallback
}

/** ISO 时间 → 本地 YYYY-MM-DD HH:mm。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
