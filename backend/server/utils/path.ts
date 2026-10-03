/**
 * 公开 API 路径匹配。
 * 规则：精确命中前缀，或命中“前缀 + /”下的子路径。
 * 不能用裸 startsWith，否则 /api/health 会误伤 /api/healthcheck 这类同级路径。
 */
const PUBLIC_PREFIXES = ['/api/health', '/api/auth']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
