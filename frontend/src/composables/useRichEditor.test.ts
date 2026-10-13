import { describe, expect, it } from 'vitest'
import { parseBridgeMessage } from './useRichEditor'

describe('parseBridgeMessage', () => {
  it('accepts valid done message', () => {
    const msg = { source: 'txwx-rich-editor', type: 'done', draftId: 'abc', html: '<p></p>' }
    expect(parseBridgeMessage(msg)).toEqual(msg)
  })

  it('accepts valid cancel message', () => {
    const msg = { source: 'txwx-rich-editor', type: 'cancel' }
    expect(parseBridgeMessage(msg)).toEqual(msg)
  })

  it('accepts valid update message', () => {
    const msg = { source: 'txwx-rich-editor', type: 'update', html: '<p>hi</p>' }
    expect(parseBridgeMessage(msg)).toEqual(msg)
  })

  it('rejects wrong source', () => {
    expect(parseBridgeMessage({ source: 'other', type: 'done' })).toBeNull()
  })

  it('rejects unknown type', () => {
    expect(parseBridgeMessage({ source: 'txwx-rich-editor', type: 'unknown' })).toBeNull()
  })

  it('rejects non-object', () => {
    expect(parseBridgeMessage(null)).toBeNull()
    expect(parseBridgeMessage('string')).toBeNull()
    expect(parseBridgeMessage(123)).toBeNull()
  })

  it('rejects missing source', () => {
    expect(parseBridgeMessage({ type: 'done' })).toBeNull()
  })
})
