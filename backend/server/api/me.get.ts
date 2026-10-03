/** 返回当前登录用户及其角色（受认证中间件保护）。 */
export default defineEventHandler((event) => {
  const user = requireUser(event)
  const roles = getRoleNames(event)
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    phoneNumberVerified: user.phoneNumberVerified,
    createdAt: user.createdAt,
    roles
  })
})
