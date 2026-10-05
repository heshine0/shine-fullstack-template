import { describe, expect, it } from 'vitest'
import {
  AVATAR_MIME_BY_EXT,
  buildAvatarFileName,
  isSafeAvatarFileName,
  resolveAvatarExt
} from './upload'

describe('resolveAvatarExt', () => {
  it('maps supported image MIME types to extensions', () => {
    expect(resolveAvatarExt('image/jpeg')).toBe('jpg')
    expect(resolveAvatarExt('image/png')).toBe('png')
    expect(resolveAvatarExt('image/webp')).toBe('webp')
  })

  it('is case-insensitive on the MIME type', () => {
    expect(resolveAvatarExt('image/JPEG')).toBe('jpg')
  })

  it('rejects unsupported or empty MIME types', () => {
    expect(resolveAvatarExt('image/gif')).toBeNull()
    expect(resolveAvatarExt('image/svg+xml')).toBeNull()
    expect(resolveAvatarExt('application/octet-stream')).toBeNull()
    expect(resolveAvatarExt('')).toBeNull()
  })
})

describe('buildAvatarFileName', () => {
  it('builds a server-generated name that passes the safe-name check', () => {
    const name = buildAvatarFileName('user_123-ABC', 'jpg')
    expect(name).toMatch(/^user_123-ABC-\d+\.jpg$/)
    expect(isSafeAvatarFileName(name)).toBe(true)
  })

  it('strips characters outside the safe charset from the user id', () => {
    const name = buildAvatarFileName('../../etc/passwd', 'png')
    expect(name).toMatch(/^etcpasswd-\d+\.png$/)
    expect(isSafeAvatarFileName(name)).toBe(true)
  })
})

describe('isSafeAvatarFileName', () => {
  it('accepts normal generated file names', () => {
    expect(isSafeAvatarFileName('user_123-ABC-1728000000000.webp')).toBe(true)
  })

  it('rejects path traversal and non-image names', () => {
    expect(isSafeAvatarFileName('../secret.png')).toBe(false)
    expect(isSafeAvatarFileName('a.png/../../b')).toBe(false)
    expect(isSafeAvatarFileName('x.svg')).toBe(false)
    expect(isSafeAvatarFileName('x.gif')).toBe(false)
    expect(isSafeAvatarFileName('.png')).toBe(false)
    expect(isSafeAvatarFileName('x.PNG')).toBe(false)
    expect(isSafeAvatarFileName('a b.png')).toBe(false)
    expect(isSafeAvatarFileName('')).toBe(false)
  })
})

describe('AVATAR_MIME_BY_EXT', () => {
  it('provides a content type for every served extension', () => {
    expect(AVATAR_MIME_BY_EXT.jpg).toBe('image/jpeg')
    expect(AVATAR_MIME_BY_EXT.png).toBe('image/png')
    expect(AVATAR_MIME_BY_EXT.webp).toBe('image/webp')
  })
})
