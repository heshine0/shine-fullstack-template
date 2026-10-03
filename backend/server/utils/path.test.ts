import { describe, expect, it } from 'vitest'
import { isPublicPath } from './path'

describe('isPublicPath', () => {
  it('allows the exact /api/health path', () => {
    expect(isPublicPath('/api/health')).toBe(true)
  })

  it('allows Better Auth endpoints under /api/auth/', () => {
    expect(isPublicPath('/api/auth')).toBe(true)
    expect(isPublicPath('/api/auth/sign-in/email')).toBe(true)
    expect(isPublicPath('/api/auth/sign-out')).toBe(true)
  })

  it('does not treat sibling prefixes of /api/health as public', () => {
    expect(isPublicPath('/api/healthcheck')).toBe(false)
    expect(isPublicPath('/api/health-secret')).toBe(false)
    expect(isPublicPath('/api/health2')).toBe(false)
  })

  it('does not treat sibling prefixes of /api/auth as public', () => {
    expect(isPublicPath('/api/authorized')).toBe(false)
    expect(isPublicPath('/api/authenticate')).toBe(false)
  })

  it('requires authentication for regular API paths', () => {
    expect(isPublicPath('/api/posts')).toBe(false)
    expect(isPublicPath('/api/me')).toBe(false)
    expect(isPublicPath('/api/admin/users')).toBe(false)
  })
})
