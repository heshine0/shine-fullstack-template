import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalizePhoneNumber, normalizePhoneNumber } from './sms'
import { MOCK_PHONE_CODE_PREFIX, parseMockPhoneCode } from './wechat'

afterEach(() => {
  vi.resetModules()
})

describe('normalizePhoneNumber', () => {
  it('accepts canonical 11-digit mainland mobile numbers', () => {
    expect(normalizePhoneNumber('13800138000')).toBe('13800138000')
  })

  it('strips separators and +86/86 country prefixes', () => {
    expect(normalizePhoneNumber('+86 138-0013-8000')).toBe('13800138000')
    expect(normalizePhoneNumber('8613800138000')).toBe('13800138000')
  })

  it('rejects invalid numbers', () => {
    expect(normalizePhoneNumber('12345')).toBeNull()
    expect(normalizePhoneNumber('12800138000')).toBeNull()
    expect(normalizePhoneNumber('')).toBeNull()
  })
})

describe('canonicalizePhoneNumber', () => {
  it('prefixes bare numbers with +86', () => {
    expect(canonicalizePhoneNumber('13800138000')).toBe('+8613800138000')
  })

  it('keeps an already canonical number canonical', () => {
    expect(canonicalizePhoneNumber('+86 138-0013-8000')).toBe('+8613800138000')
  })

  it('returns null for invalid numbers', () => {
    expect(canonicalizePhoneNumber('12345')).toBeNull()
  })
})

describe('parseMockPhoneCode', () => {
  it('parses a well-formed mock code to canonical +86 form', () => {
    expect(parseMockPhoneCode(`${MOCK_PHONE_CODE_PREFIX}13800138000`)).toBe('+8613800138000')
  })

  it('accepts a mock code that already contains +86', () => {
    expect(parseMockPhoneCode(`${MOCK_PHONE_CODE_PREFIX}+8613800138000`)).toBe('+8613800138000')
  })

  it('returns null without the mock prefix', () => {
    expect(parseMockPhoneCode('13800138000')).toBeNull()
  })

  it('returns null when the embedded number is invalid', () => {
    expect(parseMockPhoneCode(`${MOCK_PHONE_CODE_PREFIX}123`)).toBeNull()
  })
})

describe('getPhoneNumberByCode', () => {
  it('resolves the phone directly in mock mode without network access', async () => {
    process.env.WECHAT_MOCK = 'true'
    const mod = await import('./wechat')
    await expect(mod.getPhoneNumberByCode(`${MOCK_PHONE_CODE_PREFIX}13912345678`)).resolves.toBe('+8613912345678')
  })

  it('rejects a malformed code in mock mode', async () => {
    process.env.WECHAT_MOCK = 'true'
    const mod = await import('./wechat')
    await expect(mod.getPhoneNumberByCode('13912345678')).rejects.toBeInstanceOf(mod.WechatApiError)
  })

  it('fails fast with a config error when credentials are missing in real mode', async () => {
    process.env.WECHAT_MOCK = 'false'
    process.env.WECHAT_APPID = ''
    process.env.WECHAT_SECRET = ''
    const mod = await import('./wechat')
    await expect(mod.getPhoneNumberByCode('any-real-code')).rejects.toBeInstanceOf(mod.WechatConfigError)
  })
})
