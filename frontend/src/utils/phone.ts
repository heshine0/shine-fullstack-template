const CN_MOBILE_RE = /^1[3-9]\d{9}$/

/**
 * 手机号脱敏展示：'+8613812345678' / '13812345678' → '138****5678'。
 * 非大陆手机号或无法识别的输入原样返回；空值返回空串。
 */
export function maskPhoneNumber(input?: string | null): string {
  if (!input)
    return ''
  const digits = input.replace(/\D/g, '').replace(/^86/, '')
  if (!CN_MOBILE_RE.test(digits))
    return input
  return `${digits.slice(0, 3)}****${digits.slice(7)}`
}
