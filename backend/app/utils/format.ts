/** 从 $fetch 抛出的统一错误体中提取可读信息。 */
export function apiErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  const e = err as { data?: { message?: string }, statusMessage?: string, message?: string }
  return e?.data?.message || e?.statusMessage || e?.message || fallback
}

/** 字节数 → 可读大小（B/KB/MB/GB）。 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 100 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`
}

/** ISO 时间 → 本地 YYYY-MM-DD HH:mm。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
