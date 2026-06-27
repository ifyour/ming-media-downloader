import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseRednote } from '../../worker/src/rednote'
import type { Env } from '../../worker/src/types'

describe('parseRednote', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: Env

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    mockEnv = { MMD_CACHE: {} as KVNamespace }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function buildHtmlWithInitialState(noteId: string, overrides: Record<string, unknown> = {}): string {
    const state = {
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: 'Test Title',
              desc: 'Test Description',
              type: 'normal',
              imageList: [],
              user: {
                nickname: 'TestAuthor',
                avatar: 'https://example.com/avatar.jpg',
              },
              ...overrides,
            },
          },
        },
      },
    }
    return `<html><body><script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script></body></html>`
  }

  const noteId = 'abcdef123'

  it('parses a normal image note', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'normal',
      imageList: [
        { urlDefault: 'https://ex.com/img1.jpg' },
        { urlDefault: 'https://ex.com/img2.jpg' },
      ],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.platform).toBe('rednote')
    expect(result.id).toBe(noteId)
    expect(result.type).toBe('images')
    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toBe('https://ex.com/img1.jpg')
    expect(result.author.name).toBe('TestAuthor')
  })

  it('parses a video note with h264 streams', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'video',
      video: {
        media: {
          stream: {
            h264: [
              { masterUrl: 'https://ex.com/vid_1080p.mp4', width: 1920, height: 1080, size: 10_000_000, qualityType: '1080p', fps: 30 },
              { masterUrl: 'https://ex.com/vid_720p.mp4', width: 1280, height: 720, size: 5_000_000, qualityType: '720p', fps: 30 },
            ],
            h265: [],
          },
        },
      },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.rednote.com/explore/${noteId}`, mockEnv)
    expect(result.type).toBe('video')
    expect(result.videos).toHaveLength(2)
    // Should be sorted by resolution descending
    expect(result.videos[0].quality).toBe('1080p')
    expect(result.videos[1].quality).toBe('720p')
  })

  it('deduplicates video streams by URL', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'video',
      video: {
        media: {
          stream: {
            h264: [
              { masterUrl: 'https://ex.com/dup.mp4', width: 1920, height: 1080 },
              { masterUrl: 'https://ex.com/dup.mp4', width: 1920, height: 1080 },
            ],
            h265: [],
          },
        },
      },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.videos).toHaveLength(1)
  })

  it('degrades video type to images when no videos found but images exist', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      type: 'video',
      video: { media: { stream: { h264: [], h265: [] } } },
      imageList: [{ urlDefault: 'https://ex.com/img.jpg' }],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.type).toBe('images')
    expect(result.images).toHaveLength(1)
  })

  it('extracts image urls from both urlDefault and url fields', async () => {
    const html = buildHtmlWithInitialState(noteId, {
      imageList: [
        { urlDefault: 'https://ex.com/default.jpg' },
        { url: 'https://ex.com/fallback.jpg' },
      ],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.images[0]).toBe('https://ex.com/default.jpg')
    expect(result.images[1]).toBe('https://ex.com/fallback.jpg')
  })

  it('retries on fetch failure (3 attempts)', async () => {
    const html = buildHtmlWithInitialState(noteId)
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => html,
      })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    expect(result.id).toBe(noteId)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('throws when all fetch attempts fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'))

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    ).rejects.toThrow('Failed to fetch RedNote page')
  })

  it('throws for invalid RedNote URL', async () => {
    await expect(
      parseRednote('https://example.com/not-rednote', mockEnv)
    ).rejects.toThrow('Invalid RedNote URL')
  })

  it('throws when HTML has no INITIAL_STATE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No state here</body></html>',
    })

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, mockEnv)
    ).rejects.toThrow('Failed to parse RedNote note data')
  })
})
