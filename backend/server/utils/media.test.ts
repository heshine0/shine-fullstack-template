import { describe, expect, it } from 'vitest'
import {
  buildObjectKey,
  buildObjectUrl,
  extFromMime,
  getCosAppId,
  getMimeCategory,
  isMediaType,
  mimeMatchesType,
  parseObjectKey,
  sanitizeFileName
} from './media'

const UUID = '00000000-0000-0000-0000-000000000000'

describe('getMimeCategory', () => {
  it('maps MIME to media category', () => {
    expect(getMimeCategory('image/jpeg')).toBe('image')
    expect(getMimeCategory('video/mp4')).toBe('video')
    expect(getMimeCategory('audio/mpeg')).toBe('audio')
    expect(getMimeCategory('application/pdf')).toBe('file')
  })

  it('falls back to file for unknown or empty MIME', () => {
    expect(getMimeCategory('')).toBe('file')
    expect(getMimeCategory(null)).toBe('file')
    expect(getMimeCategory('application/octet-stream')).toBe('file')
  })
})

describe('mimeMatchesType', () => {
  it('returns true only when category matches', () => {
    expect(mimeMatchesType('image', 'image/png')).toBe(true)
    expect(mimeMatchesType('video', 'video/mp4')).toBe(true)
    expect(mimeMatchesType('file', 'application/zip')).toBe(true)
    expect(mimeMatchesType('image', 'video/mp4')).toBe(false)
  })
})

describe('isMediaType', () => {
  it('recognizes registered types', () => {
    expect(isMediaType('image')).toBe(true)
    expect(isMediaType('file')).toBe(true)
    expect(isMediaType('doc')).toBe(false)
    expect(isMediaType(null)).toBe(false)
  })
})

describe('extFromMime', () => {
  it('maps known MIME and rejects unknown', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('video/mp4')).toBe('mp4')
    expect(extFromMime('application/x-unknown')).toBeNull()
  })
})

describe('buildObjectKey', () => {
  it('uses the type prefix, a uuid and the extension', () => {
    const key = buildObjectKey('image', 'jpg')
    expect(key).toMatch(/^images\/[0-9a-f-]{36}\.jpg$/)
  })

  it('omits extension when ext is null', () => {
    const key = buildObjectKey('file', null)
    expect(key).toMatch(/^files\/[0-9a-f-]{36}$/)
  })

  it('builds keys that parse back to the same type', () => {
    for (const type of ['image', 'video', 'audio', 'file'] as const) {
      const key = buildObjectKey(type, extFromMime(
        type === 'image'
          ? 'image/png'
          : type === 'video'
            ? 'video/mp4'
            : type === 'audio'
              ? 'audio/mpeg'
              : 'application/pdf'
      ))
      expect(parseObjectKey(key)?.type).toBe(type)
    }
  })
})

describe('parseObjectKey', () => {
  it('parses legitimate keys', () => {
    expect(parseObjectKey(`images/${UUID}.jpg`)).toEqual({ type: 'image', id: UUID, ext: 'jpg' })
    expect(parseObjectKey(`files/${UUID}`)).toEqual({ type: 'file', id: UUID, ext: null })
  })

  it('rejects path traversal and forged keys', () => {
    expect(parseObjectKey('images/../secret.jpg')).toBeNull()
    expect(parseObjectKey(`images/..%2f${UUID}.jpg`)).toBeNull()
    expect(parseObjectKey('images/not-a-uuid.jpg')).toBeNull()
    expect(parseObjectKey(`images/${UUID}.jpg/extra`)).toBeNull()
    expect(parseObjectKey(`evil/${UUID}.jpg`)).toBeNull()
    expect(parseObjectKey(`images/${UUID}.EXE`)).toBeNull()
    expect(parseObjectKey('')).toBeNull()
  })

  it('derives type strictly from the registered prefix', () => {
    expect(parseObjectKey(`videos/${UUID}.jpg`)?.type).toBe('video')
  })
})

describe('getCosAppId', () => {
  it('extracts the trailing numeric appid', () => {
    expect(getCosAppId('bucket-1250000000')).toBe('1250000000')
  })

  it('rejects malformed bucket names', () => {
    expect(getCosAppId('bucket')).toBeNull()
    expect(getCosAppId('bucket-abc')).toBeNull()
    expect(getCosAppId('-1250000000')).toBeNull()
  })
})

describe('buildObjectUrl', () => {
  it('builds the default COS url', () => {
    expect(buildObjectUrl('b-1250000000', 'ap-shanghai', 'images/a b.jpg'))
      .toBe('https://b-1250000000.cos.ap-shanghai.myqcloud.com/images/a%20b.jpg')
  })

  it('uses the custom domain when provided, tolerating scheme/trailing slash', () => {
    expect(buildObjectUrl('b-1250000000', 'ap-shanghai', 'images/a.jpg', 'cdn.example.com/'))
      .toBe('https://cdn.example.com/images/a.jpg')
    expect(buildObjectUrl('b-1250000000', 'ap-shanghai', 'images/a.jpg', 'http://cdn.example.com'))
      .toBe('http://cdn.example.com/images/a.jpg')
  })
})

describe('sanitizeFileName', () => {
  it('strips path components and control characters', () => {
    expect(sanitizeFileName('C:\\temp\\a.png')).toBe('a.png')
    expect(sanitizeFileName('dir/a b.png')).toBe('a b.png')
    expect(sanitizeFileName(`a\u0000.png`)).toBe('a.png')
  })

  it('truncates to the max length', () => {
    expect(sanitizeFileName('x'.repeat(250), 200)).toHaveLength(200)
  })
})
