import { getCachedSettingsMap } from '../../utils/settings-cache'

/**
 * 公开端点：全量设置键值映射（无需登录），读取走缓存。
 * 设置对所有访客只读可见，勿存放密钥等敏感信息。
 */
export default defineEventHandler(async () => ok(await getCachedSettingsMap()))
