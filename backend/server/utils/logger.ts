import { consola } from 'consola'
import type { H3Event } from 'h3'

/** 全局结构化日志器（基于 consola）。 */
export const logger = consola

function rid(event?: H3Event): string {
  return event?.context?.requestId ? `[${event.context.requestId}] ` : ''
}

export interface LogMeta {
  [key: string]: unknown
}

/** 面向单个请求的日志快捷方法，自动带 requestId 前缀。 */
export function logInfo(event: H3Event | undefined, message: string, meta?: LogMeta) {
  logger.info(`${rid(event)}${message}`, meta ?? '')
}

export function logWarn(event: H3Event | undefined, message: string, meta?: LogMeta) {
  logger.warn(`${rid(event)}${message}`, meta ?? '')
}

export function logError(event: H3Event | undefined, message: string, meta?: LogMeta) {
  logger.error(`${rid(event)}${message}`, meta ?? '')
}
