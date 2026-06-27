import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isRecord,
  getString,
  getNumber,
  getArray,
  getRecord,
  getErrorMessage,
  resolveUrl,
  extractTwitterDimensions,
  extractTwitterQuality,
} from '../../worker/src/utils'

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isRecord([1, 2, 3])).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord('string')).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord(true)).toBe(false)
  })
})

describe('getString', () => {
  it('returns string value from record', () => {
    expect(getString({ name: 'test' }, 'name')).toBe('test')
  })

  it('returns empty string for missing key', () => {
    expect(getString({}, 'name')).toBe('')
  })

  it('returns empty string for non-string value', () => {
    expect(getString({ name: 123 }, 'name')).toBe('')
  })

  it('returns empty string when input is not a record', () => {
    expect(getString(null, 'name')).toBe('')
    expect(getString('foo', 'name')).toBe('')
  })
})

describe('getNumber', () => {
  it('returns number from record', () => {
    expect(getNumber({ count: 42 }, 'count')).toBe(42)
  })

  it('returns 0 for missing key', () => {
    expect(getNumber({}, 'count')).toBe(0)
  })

  it('returns 0 for non-number value', () => {
    expect(getNumber({ count: '42' }, 'count')).toBe(0)
  })

  it('returns 0 when input is not a record', () => {
    expect(getNumber(null, 'count')).toBe(0)
  })
})

describe('getArray', () => {
  it('returns array from record', () => {
    expect(getArray({ items: [1, 2, 3] }, 'items')).toEqual([1, 2, 3])
  })

  it('returns empty array for missing key', () => {
    expect(getArray({}, 'items')).toEqual([])
  })

  it('returns empty array for non-array value', () => {
    expect(getArray({ items: 'not-array' }, 'items')).toEqual([])
  })

  it('returns empty array when input is not a record', () => {
    expect(getArray(null, 'items')).toEqual([])
  })
})

describe('getRecord', () => {
  it('returns nested record from record', () => {
    expect(getRecord({ nested: { a: 1 } }, 'nested')).toEqual({ a: 1 })
  })

  it('returns null for missing key', () => {
    expect(getRecord({}, 'nested')).toBeNull()
  })

  it('returns null when value is not a record', () => {
    expect(getRecord({ nested: 'string' }, 'nested')).toBeNull()
  })

  it('returns null when input is not a record', () => {
    expect(getRecord(null, 'nested')).toBeNull()
  })
})

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke')
  })

  it('returns string directly', () => {
    expect(getErrorMessage('custom error')).toBe('custom error')
  })

  it('returns fallback for unknown types', () => {
    expect(getErrorMessage(null)).toBe('Unknown error')
    expect(getErrorMessage(42)).toBe('Unknown error')
    expect(getErrorMessage(undefined)).toBe('Unknown error')
  })
})

describe('resolveUrl', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('passes through non-shortened URLs unchanged', async () => {
    const url = await resolveUrl('https://xiaohongshu.com/explore/123')
    expect(url).toBe('https://xiaohongshu.com/explore/123')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('adds https prefix when missing', async () => {
    const url = await resolveUrl('xiaohongshu.com/explore/123')
    expect(url).toBe('https://xiaohongshu.com/explore/123')
  })

  it('follows redirect for xhslink.com', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(Object.entries({ location: 'https://xiaohongshu.com/explore/abc' })),
    })
    const url = await resolveUrl('https://xhslink.com/abc')
    expect(url).toBe('https://xiaohongshu.com/explore/abc')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const reqUrl = mockFetch.mock.calls[0][0]
    expect(reqUrl).toContain('xhslink.com')
  })

  it('handles doubleclick.net redirect', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(Object.entries({ location: 'https://x.com/user/status/123' })),
    })
    const url = await resolveUrl('https://doubleclick.net/xyz')
    expect(url).toBe('https://x.com/user/status/123')
  })

  it('handles t.co redirect', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(Object.entries({ location: 'https://x.com/user/status/456' })),
    })
    const url = await resolveUrl('https://t.co/abc')
    expect(url).toBe('https://x.com/user/status/456')
  })

  it('recursively resolves chained redirects', async () => {
    mockFetch
      .mockResolvedValueOnce({
        headers: new Map(Object.entries({ location: 'https://t.co/xyz' })),
      })
      .mockResolvedValueOnce({
        headers: new Map(Object.entries({ location: 'https://x.com/user/status/789' })),
      })
    const url = await resolveUrl('https://xhslink.com/chain')
    expect(url).toBe('https://x.com/user/status/789')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns cleaned URL when redirect has no location header', async () => {
    mockFetch.mockResolvedValueOnce({
      headers: new Map(),
    })
    const url = await resolveUrl('https://xhslink.com/abc')
    expect(url).toBe('https://xhslink.com/abc')
  })
})

describe('extractTwitterDimensions', () => {
  it('parses WxH from URL path', () => {
    expect(extractTwitterDimensions('https://example.com/video/720x1280.mp4')).toEqual({
      width: 720,
      height: 1280,
    })
  })

  it('returns null for URL without dimensions', () => {
    expect(extractTwitterDimensions('https://example.com/video.mp4')).toBeNull()
  })

  it('returns null for empty URL', () => {
    expect(extractTwitterDimensions('')).toBeNull()
  })
})

describe('extractTwitterQuality', () => {
  it('returns 1080p for height >= 1080', () => {
    expect(extractTwitterQuality('/video/1920x1080.mp4')).toBe('1080p')
  })

  it('returns 720p for height >= 720', () => {
    expect(extractTwitterQuality('/video/1280x720.mp4')).toBe('720p')
  })

  it('returns 480p for height >= 480', () => {
    expect(extractTwitterQuality('/video/640x480.mp4')).toBe('480p')
  })

  it('returns Np for lower resolutions', () => {
    expect(extractTwitterQuality('/video/320x360.mp4')).toBe('360p')
  })

  it('returns HD when dimensions cannot be extracted', () => {
    expect(extractTwitterQuality('/video/no-dimensions.mp4')).toBe('HD')
  })
})
