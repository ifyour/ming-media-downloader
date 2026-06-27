import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseWithCache } from '../../worker/src/parse'
import type { Env } from '../../worker/src/types'

describe('parseWithCache', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: Env
  let mockCtx: ExecutionContext

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    mockEnv = {
      MMD_CACHE: {
        getWithMetadata: vi.fn(),
        put: vi.fn(),
        get: vi.fn(),
      } as unknown as KVNamespace,
    }
    mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('delegates rednote URLs to parseRednote', async () => {
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({ value: null, metadata: null })
    const stateJson = JSON.stringify({
      note: { noteDetailMap: { abc123: { note: { title: 'RN', desc: '', type: 'normal', imageList: [], user: { nickname: 'A', avatar: '' } } } } },
    })
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => `<html><script>window.__INITIAL_STATE__=${stateJson}</script></html>`,
    })

    const result = await parseWithCache('https://www.xiaohongshu.com/explore/abc123', mockEnv, mockCtx)
    expect(result.platform).toBe('rednote')
    expect(result.id).toBe('abc123')
  })

  it('delegates twitter URLs to parseTwitter', async () => {
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({ value: null, metadata: null })
    const tweetData = {
      tweet: {
        text: 'Tweet test',
        media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
        author: { name: 'U', screen_name: 'u', avatar_url: '' },
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => tweetData,
    })

    const result = await parseWithCache('https://x.com/user/status/999', mockEnv, mockCtx)
    expect(result.platform).toBe('twitter')
    expect(result.id).toBe('999')
  })

  it('throws for unsupported platforms', async () => {
    const result = parseWithCache('https://youtube.com/watch?v=abc', mockEnv, mockCtx)
    await expect(result).rejects.toThrow('Unsupported platform')
  })

  it('returns cached data when cache is fresh (< 12h)', async () => {
    const cachedData = {
      platform: 'twitter' as const, id: '123', type: 'images' as const,
      title: 'Cached', desc: '', cover: '',
      author: { name: 'U', avatar: '' },
      videos: [], images: [],
    }
    vi.mocked(mockEnv.MMD_CACHE.getWithMetadata).mockResolvedValue({
      value: cachedData,
      metadata: { cachedAt: Date.now() - 1000 },
    })

    const result = await parseWithCache('https://x.com/user/status/123', mockEnv, mockCtx)
    expect(result.title).toBe('Cached')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
