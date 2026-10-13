/**
 * 富文本编辑器链接地址归一化（供 rich-viewer 的链接处理使用）：
 * - 去除首尾空白，空值返回 null；
 * - 仅放行 http(s)://、mailto:、tel: 三种协议，javascript:/data:/vbscript: 等一律拒绝；
 * - 协议相对地址（//host/path）补 https:；
 * - 无协议但形似域名（example.com / www.a.cn:8080/p）补 https://；
 * - 其余无法识别的输入（纯文字、相对路径等）返回 null。
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i
// 域名形态：至少一个点，TLD 为 2+ 字母；标签仅允许字母数字与连字符且不以连字符开头/结尾
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i

export function normalizeLinkUrl(input: string): string | null {
  const url = input.trim()
  if (!url)
    return null

  // 协议相对地址 //example.com/path → https://example.com/path
  if (url.startsWith('//')) {
    const rest = url.slice(2)
    return DOMAIN_RE.test(rest) ? `https:${url}` : null
  }

  const schemeMatch = SCHEME_RE.exec(url)
  if (schemeMatch) {
    const protocol = `${schemeMatch[1].toLowerCase()}:`
    if (!ALLOWED_PROTOCOLS.has(protocol)) {
      // 形如 www.example.com:8080/path 的输入会被 scheme 正则误判为「协议:」；
      // 真实协议名不含点，含点时按 host:port 形态走域名补全
      if (schemeMatch[1].includes('.'))
        return DOMAIN_RE.test(url) ? `https://${url}` : null
      return null
    }
    const rest = url.slice(schemeMatch[0].length)
    if (protocol === 'http:' || protocol === 'https:') {
      // 必须带非空主机名（拒绝 http://、http:///path 这类残缺地址）
      if (!/^\/\/[^\s/?#]+/.test(rest))
        return null
    }
    else if (!rest.trim()) {
      // mailto:/tel: 后必须有实际内容
      return null
    }
    return url
  }

  // 含空白（纯文字/句子）或以 / 开头（站内相对路径）均不可作为外链
  if (/\s/.test(url) || url.startsWith('/'))
    return null

  return DOMAIN_RE.test(url) ? `https://${url}` : null
}
