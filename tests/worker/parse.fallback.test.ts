import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseWithCache } from '../../worker/src/parse'
import * as cacheModule from '../../worker/src/cache'
import type { Env, MediaResult } from '../../worker/src/types'

describe('parseWithCache — degradation paths', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: Env
  let mockCtx: ExecutionContext
  let mockCacheGetWithMetadata: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
    mockCacheGetWithMetadata = vi.fn()
    mockEnv = {
      MMD_CACHE: {
        getWithMetadata: mockCacheGetWithMetadata,
        put: vi.fn(),
        get: vi.fn(),
      } as unknown as KVNamespace,
    }
    mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const staleData: MediaResult = {
    platform: 'twitter', id: '999', type: 'images',
    title: 'Stale', desc: '', cover: '',
    author: { name: 'U', avatar: '' },
    videos: [], images: [],
  }

  it('returns stale cache when fresh fetch fails', async () => {
    mockCacheGetWithMetadata.mockResolvedValue({
      value: staleData,
      metadata: { cachedAt: Date.now() - 4 * 24 * 60 * 60 * 1000 },
    })

    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' })

    const result = await parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    expect(result.title).toBe('Stale')
  })

  it('re-throws error when no cache available and fetch fails', async () => {
    mockCacheGetWithMetadata.mockResolvedValue({ value: null, metadata: null })
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' })

    await expect(
      parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    ).rejects.toThrow()
  })

  it('triggers background refresh for stale cache (12h-3d)', async () => {
    mockCacheGetWithMetadata.mockResolvedValue({
      value: staleData,
      metadata: { cachedAt: Date.now() - 18 * 60 * 60 * 1000 },
    })

    const tweetData = {
      tweet: {
        text: 'Fresh data',
        media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
        author: { name: 'U', screen_name: 'u', avatar_url: '' },
      },
    }
    mockFetch.mockResolvedValue({ ok: true, json: async () => tweetData })

    const result = await parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    expect(result.title).toBe('Stale')
    expect(mockCtx.waitUntil).toHaveBeenCalled()
  })

  it('bypasses cache when getCacheKey returns null', async () => {
    const spy = vi.spyOn(cacheModule, 'getCacheKey').mockReturnValue(null)
    try {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          tweet: {
            text: 'No cache key',
            media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
            author: { name: 'U', screen_name: 'u', avatar_url: '' },
          },
        }),
      })

      const result = await parseWithCache('https://x.com/user/status/999?extra=param', mockEnv, mockCtx)
      expect(result.title).toBe('No cache key')
      expect(mockCacheGetWithMetadata).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
