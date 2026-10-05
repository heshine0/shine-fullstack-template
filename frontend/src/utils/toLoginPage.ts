import { getLastPage } from '@/utils'
import { debounce } from '@/utils/debounce'

interface ToLoginPageOptions {
  /**
   * 跳转模式, uni.navigateTo | uni.reLaunch
   * @default 'navigateTo'
   */
  mode?: 'navigateTo' | 'reLaunch'
  /**
   * 登录成功后的回跳地址。
   * - 默认自动携带当前页面完整路径（含查询参数）；
   * - 显式传 null 表示不携带，登录后回兜底首页。
   */
  redirect?: string | null
  /**
   * 额外查询参数，会拼在 redirect 之后
   * @example '?from=tab'
   */
  queryString?: string
}

// TODO: 自己增加登录页
const LOGIN_PAGE = '/pages/login/index'

/** 仅允许应用内绝对路径，拒绝 http(s)://、协议相对 URL // 等外链 */
function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

/** 获取当前页面完整路径（含查询串），作为登录回跳地址 */
function currentFullPath(page: ReturnType<typeof getLastPage>): string {
  const fullPath = page?.$page?.fullPath
  if (fullPath)
    return fullPath.startsWith('/') ? fullPath : `/${fullPath}`
  return page?.route ? `/${page.route}` : ''
}

/**
 * 跳转到登录页, 带防抖处理
 *
 * 默认通过 `redirect` 查询参数携带当前页面完整路径，登录成功后可回跳原页面。
 * 如果要立即跳转，不做延时，可以使用 `toLoginPage.flush()` 方法
 */
export const toLoginPage = debounce((options: ToLoginPageOptions = {}) => {
  const { mode = 'navigateTo', queryString = '', redirect } = options

  // 获取当前页面路径
  const currentPage = getLastPage()
  const currentPath = currentPage ? `/${currentPage.route}` : ''
  // 如果已经在登录页，则不跳转
  if (currentPath === LOGIN_PAGE) {
    return
  }

  const params: string[] = []
  // 默认回跳当前页；显式传 null 可关闭
  const redirectTarget = redirect === undefined ? currentFullPath(currentPage) : redirect
  if (redirectTarget && isInternalPath(redirectTarget))
    params.push(`redirect=${encodeURIComponent(redirectTarget)}`)
  if (queryString)
    params.push(queryString.replace(/^\?/, ''))

  const url = params.length ? `${LOGIN_PAGE}?${params.join('&')}` : LOGIN_PAGE

  if (mode === 'navigateTo') {
    uni.navigateTo({ url })
  }
  else {
    uni.reLaunch({ url })
  }
}, 500)
