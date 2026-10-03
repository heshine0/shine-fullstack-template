import { logger } from './logger'

/**
 * 短信发送抽象。
 * 当前仅有日志实现（开发期从后端控制台取验证码）；
 * 接入腾讯云/阿里云等服务商时，新增一个该签名的实现并在 auth.ts 替换即可，
 * 调用方（better-auth phoneNumber 插件）无需改动。
 */
export interface SmsSender {
  (args: { phoneNumber: string, code: string }): Promise<void> | void
}

/** 中国大陆手机号：11 位、1 开头、第二位 3-9。 */
const CN_MOBILE_RE = /^1[3-9]\d{9}$/

/**
 * 归一化手机号：去除空白/连字符，兼容 +86 / 86 前缀，返回 11 位号码。
 * 无法识别为大陆手机号时返回 null。
 */
export function normalizePhoneNumber(input: string): string | null {
  const compact = input.replaceAll(/[\s()-]/g, '')
  const withoutCountry = compact.replace(/^(\+?86)/, '')
  return CN_MOBILE_RE.test(withoutCountry) ? withoutCountry : null
}

/**
 * 规范化为带国家号的存储/展示形态，如 '+8613800138000'。
 * 非法号码返回 null。当前仅支持中国大陆手机号。
 */
export function canonicalizePhoneNumber(input: string): string | null {
  const bare = normalizePhoneNumber(input)
  return bare ? `+86${bare}` : null
}

/** better-auth phoneNumberValidator 签名：仅校验，不抛错。 */
export async function isValidPhoneNumber(phoneNumber: string): Promise<boolean> {
  return normalizePhoneNumber(phoneNumber) !== null
}

/**
 * 开发期短信发送实现：验证码只写入服务端日志，不真正发送。
 * TODO: 接入真实短信服务商后替换此实现。
 */
export const logSmsSender: SmsSender = ({ phoneNumber, code }) => {
  logger.info(`[OTP][DEV-ONLY] 向 ${phoneNumber} 发送短信验证码：${code}（未接入短信服务商，请勿在生产使用）`)
}
