import { describe, expect, it } from 'vitest'
import { normalizeLinkUrl } from './rich-link'

describe('normalizeLinkUrl', () => {
  it('keeps valid http(s) urls unchanged', () => {
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeLinkUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(normalizeLinkUrl('https://example.com:8080/path')).toBe('https://example.com:8080/path')
  })

  it('accepts uppercase protocol spellings', () => {
    expect(normalizeLinkUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM')
  })

  it('prepends https:// for domain-like input without protocol', () => {
    expect(normalizeLinkUrl('example.com')).toBe('https://example.com')
    expect(normalizeLinkUrl('www.example.com:8080/path?q=1')).toBe('https://www.example.com:8080/path?q=1')
    expect(normalizeLinkUrl('foo.bar/')).toBe('https://foo.bar/')
    expect(normalizeLinkUrl('sub.example.com:443')).toBe('https://sub.example.com:443')
  })

  it('does not treat host:port as a dangerous scheme', () => {
    // 伪装成「协议:」的域名：含点的 scheme 回退到 host:port 判定，非数字端口拒绝
    expect(normalizeLinkUrl('evil.com:alert(1)')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeLinkUrl('  example.com  ')).toBe('https://example.com')
  })

  it('upgrades protocol-relative urls to https', () => {
    expect(normalizeLinkUrl('//example.com/a')).toBe('https://example.com/a')
  })

  it('allows mailto: and tel: urls', () => {
    expect(normalizeLinkUrl('mailto:foo@bar.com')).toBe('mailto:foo@bar.com')
    expect(normalizeLinkUrl('tel:+8613800000000')).toBe('tel:+8613800000000')
  })

  it('rejects javascript: and other dangerous protocols', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeLinkUrl('JavaScript:alert(1)')).toBeNull()
    expect(normalizeLinkUrl('data:text/html,<script>')).toBeNull()
    expect(normalizeLinkUrl('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeLinkUrl('file:///etc/passwd')).toBeNull()
  })

  it('rejects empty and whitespace-only input', () => {
    expect(normalizeLinkUrl('')).toBeNull()
    expect(normalizeLinkUrl('   ')).toBeNull()
  })

  it('rejects plain text, relative paths and malformed urls', () => {
    expect(normalizeLinkUrl('hello world')).toBeNull()
    expect(normalizeLinkUrl('/pages/index/index')).toBeNull()
    expect(normalizeLinkUrl('example')).toBeNull()
    expect(normalizeLinkUrl('-bad.com')).toBeNull()
    expect(normalizeLinkUrl('example .com')).toBeNull()
    expect(normalizeLinkUrl('http://')).toBeNull()
    expect(normalizeLinkUrl('http:///path')).toBeNull()
    expect(normalizeLinkUrl('//not-a-domain')).toBeNull()
    expect(normalizeLinkUrl('mailto:')).toBeNull()
  })
})
