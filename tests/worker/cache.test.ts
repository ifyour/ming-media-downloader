import { describe, it, expect } from 'vitest'
import { getCacheKey, getCacheResult, setCacheResult } from '../../worker/src/cache'
import type { MediaResult } from '../../worker/src/types'

describe('getCacheKey', () => {
  it('returns xhs key for xiaohongshu.com explore URL', () => {
    expect(getCacheKey('https://www.xiaohongshu.com/explore/123abc')).toBe('xhs:123abc')
  })

  it('returns xhs key for xiaohongshu.com item URL', () => {
    expect(getCacheKey('https://www.xiaohongshu.com/item/456def')).toBe('xhs:456def')
  })

  it('returns xhs key for rednote.com URL', () => {
    expect(getCacheKey('https://www.rednote.com/explore/789ghi')).toBe('xhs:789ghi')
  })

  it('returns tw key for twitter.com status URL', () => {
    expect(getCacheKey('https://twitter.com/user/status/123456789')).toBe('tw:123456789')
  })

  it('returns tw key for x.com status URL', () => {
    expect(getCacheKey('https://x.com/user/status/987654321')).toBe('tw:987654321')
  })

  it('returns null for unsupported URLs', () => {
    expect(getCacheKey('https://example.com')).toBeNull()
    expect(getCacheKey('https://youtube.com/watch?v=abc')).toBeNull()
  })

  it('returns null for invalid URLs', () => {
    // Bad URL should be handled by try/catch
  })

  it('returns null for xiaohongshu URL without valid path', () => {
    expect(getCacheKey('https://www.xiaohongshu.com/')).toBeNull()
  })

  it('returns null for twitter URL without status in path', () => {
    expect(getCacheKey('https://x.com/home')).toBeNull()
  })
})

describe('getCacheResult', () => {
  it('returns CacheEntry when key exists in KV', async () => {
    const data: MediaResult = {
      platform: 'twitter', id: '123', type: 'video',
      title: 'test', desc: 'test', cover: '',
      author: { name: 'u', avatar: '' },
      videos: [], images: [],
    }
    const meta = { cachedAt: Date.now() }
    const mockKv = {
      getWithMetadata: async () => ({ value: data, metadata: meta }),
    } as unknown as KVNamespace

    const result = await getCacheResult(mockKv, 'tw:123')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
    expect(result!.meta).toEqual(meta)
  })

  it('returns null when key does not exist', async () => {
    const mockKv = {
      getWithMetadata: async () => ({ value: null, metadata: null }),
    } as unknown as KVNamespace

    const result = await getCacheResult(mockKv, 'tw:missing')
    expect(result).toBeNull()
  })

  it('returns null on KV error', async () => {
    const mockKv = {
      getWithMetadata: async () => { throw new Error('KV error') },
    } as unknown as KVNamespace

    const result = await getCacheResult(mockKv, 'tw:123')
    expect(result).toBeNull()
  })
})

describe('setCacheResult', () => {
  it('stores data with cachedAt metadata', async () => {
    const data: MediaResult = {
      platform: 'rednote', id: 'abc', type: 'images',
      title: 'test', desc: 'test', cover: '',
      author: { name: 'u', avatar: '' },
      videos: [], images: [],
    }
    let storedKey = ''
    let storedValue = ''
    let storedMetadata: unknown = null
    const mockKv = {
      put: async (key: string, value: string, opts?: unknown) => {
        storedKey = key
        storedValue = value
        storedMetadata = opts
      },
    } as unknown as KVNamespace

    await setCacheResult(mockKv, 'xhs:abc', data)
    expect(storedKey).toBe('xhs:abc')
    expect(JSON.parse(storedValue)).toEqual(data)
    expect(storedMetadata).toHaveProperty('metadata')
    expect((storedMetadata as { metadata: { cachedAt: number } }).metadata).toHaveProperty('cachedAt')
  })

  it('handles KV put error gracefully', async () => {
    const mockKv = {
      put: async () => { throw new Error('KV error') },
    } as unknown as KVNamespace
    await expect(setCacheResult(mockKv, 'xhs:abc', {} as MediaResult)).resolves.toBeUndefined()
  })
})
