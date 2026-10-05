import { describe, expect, it } from 'vitest'
import { maskPhoneNumber } from './phone'

describe('maskPhoneNumber', () => {
  it('masks an E.164 mainland-China number', () => {
    expect(maskPhoneNumber('+8613812345678')).toBe('138****5678')
  })

  it('masks a bare 11-digit number', () => {
    expect(maskPhoneNumber('13812345678')).toBe('138****5678')
  })

  it('ignores spaces and dashes', () => {
    expect(maskPhoneNumber('+86 138-1234-5678')).toBe('138****5678')
  })

  it('returns non-mainland and invalid numbers unchanged', () => {
    // 美国号码（11 位数字但第二位为 2，不满足大陆 1[3-9] 号段规则）
    expect(maskPhoneNumber('+1-202-555-0177')).toBe('+1-202-555-0177')
    expect(maskPhoneNumber('12345')).toBe('12345')
  })

  it('returns empty string for nullish input', () => {
    expect(maskPhoneNumber()).toBe('')
    expect(maskPhoneNumber(null)).toBe('')
    expect(maskPhoneNumber('')).toBe('')
  })
})
