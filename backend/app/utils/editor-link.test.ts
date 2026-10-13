import { describe, expect, it } from 'vitest'
import { normalizeLinkUrl } from './editor-link'

describe('normalizeLinkUrl', () => {
  it('keeps valid http(s) urls unchanged', () => {
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeLinkUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
  })

  it('prepends https:// for domain-like input without protocol', () => {
    expect(normalizeLinkUrl('example.com')).toBe('https://example.com')
    expect(normalizeLinkUrl('www.example.com:8080/path?q=1')).toBe('https://www.example.com:8080/path?q=1')
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
    expect(normalizeLinkUrl('data:text/html,<script>')).toBeNull()
    expect(normalizeLinkUrl('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeLinkUrl('file:///etc/passwd')).toBeNull()
  })

  it('rejects empty, plain text and malformed urls', () => {
    expect(normalizeLinkUrl('')).toBeNull()
    expect(normalizeLinkUrl('hello world')).toBeNull()
    expect(normalizeLinkUrl('/pages/index/index')).toBeNull()
    expect(normalizeLinkUrl('http://')).toBeNull()
    expect(normalizeLinkUrl('mailto:')).toBeNull()
  })
})
