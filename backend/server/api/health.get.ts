/** 公开健康检查（不查库、不鉴权）。 */
export default defineEventHandler(() =>
  ok({
    status: 'ok',
    service: 'tongxiangwuxie-backend',
    time: new Date().toISOString()
  }))
