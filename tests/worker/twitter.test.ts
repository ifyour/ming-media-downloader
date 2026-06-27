import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTwitter } from '../../worker/src/twitter'

describe('parseTwitter', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const validFxTwitterResponse = {
    tweet: {
      text: 'Hello world',
      media: {
        all: [
          {
            type: 'video',
            formats: [
              { url: 'https://example.com/vid/720x1280.mp4', container: 'mp4', bitrate: 500000 },
              { url: 'https://example.com/vid/480x854.mp4', container: 'mp4', bitrate: 300000 },
            ],
            width: 720,
            height: 1280,
          },
        ],
      },
      author: {
        name: 'Test User',
        screen_name: 'testuser',
        avatar_url: 'https://example.com/avatar.jpg',
      },
    },
  }

  it('parses a valid tweet with video from fxtwitter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validFxTwitterResponse,
    })

    const result = await parseTwitter('https://x.com/testuser/status/123456789')

    expect(result.platform).toBe('twitter')
    expect(result.id).toBe('123456789')
    expect(result.type).toBe('video')
    expect(result.videos).toHaveLength(2)
    expect(result.videos[0].quality).toBe('1080p')
    expect(result.author.name).toBe('Test User')
  })

  it('parses a tweet with photos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'Photo tweet',
          media: {
            all: [
              { type: 'photo', url: 'https://example.com/photo1.jpg' },
              { type: 'photo', url: 'https://example.com/photo2.jpg' },
            ],
          },
          author: { name: 'User', screen_name: 'user', avatar_url: '' },
        },
      }),
    })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.type).toBe('images')
    expect(result.images).toHaveLength(2)
  })

  it('throws TweetError for tombstone tweets', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: { type: 'tombstone' },
        message: 'This Tweet has been deleted',
      }),
    })

    await expect(parseTwitter('https://x.com/user/status/999'))
      .rejects.toThrow('This Tweet has been deleted')
  })

  it('deduplicates videos by URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'Dedup test',
          media: {
            all: [{
              type: 'video', formats: [
                { url: 'https://example.com/dup.mp4', container: 'mp4' },
                { url: 'https://example.com/dup.mp4', container: 'mp4' },
              ], width: 1920, height: 1080,
            }],
          },
          author: { name: 'U', screen_name: 'u', avatar_url: '' },
        },
      }),
    })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.videos).toHaveLength(1)
  })

  it('falls back to vxtwitter when fxtwitter fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweet: {
            text: 'From vx',
            media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
            author: { name: 'V', screen_name: 'v', avatar_url: '' },
          },
        }),
      })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.title).toBe('From vx')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('includes video from media.url field when formats are empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tweet: {
          text: 'Direct url',
          media: {
            all: [{
              type: 'video',
              formats: [],
              url: 'https://example.com/video/1080x1920.mp4',
              width: 1080, height: 1920,
            }],
          },
          author: { name: 'U', screen_name: 'u', avatar_url: '' },
        },
      }),
    })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.videos).toHaveLength(1)
    expect(result.videos[0].url).toContain('.mp4')
  })
})
