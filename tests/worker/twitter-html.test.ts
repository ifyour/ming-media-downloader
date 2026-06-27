import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTwitterHtml } from '../../worker/src/twitter-html'

describe('parseTwitterHtml', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function htmlWithOgMeta(overrides: Record<string, string> = {}): string {
    const tags = {
      'og:title': 'Tweet Title',
      'og:image': 'https://ex.com/image.jpg',
      'og:video': 'https://ex.com/video.mp4',
      'og:video:secure_url': 'https://ex.com/video.mp4',
      'og:video:width': '1280',
      'og:video:height': '720',
      'og:video:type': 'video/mp4',
      'twitter:creator': '@author',
      ...overrides,
    }
    return `<html><head>${
      Object.entries(tags)
        .map(([k, v]) => k.startsWith('twitter:')
          ? `<meta name="${k}" content="${v}" />`
          : `<meta property="${k}" content="${v}" />`)
        .join('\n')
    }</head><body></body></html>`
  }

  it('returns null when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))

    const result = await parseTwitterHtml('https://x.com/user/status/123', '123')
    expect(result).toBeNull()
  })

  it('extracts video from OG meta tags', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(htmlWithOgMeta(), { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )

    const result = await parseTwitterHtml('https://x.com/user/status/456', '456')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('video')
    expect(result!.videos[0].url).toBe('https://ex.com/video.mp4')
    expect(result!.videos[0].width).toBe(1280)
    expect(result!.videos[0].height).toBe(720)
    expect(result!.author.name).toBe('author')
  })

  it('extracts images when no og:video is present', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(htmlWithOgMeta({
        'og:video': '',
        'og:video:secure_url': '',
        'og:video:type': '',
      }), { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )

    const result = await parseTwitterHtml('https://x.com/user/status/789', '789')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('images')
    expect(result!.images).toContain('https://ex.com/image.jpg')
  })

  it('returns null when no relevant meta tags found', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('<html><head></head><body></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )

    const result = await parseTwitterHtml('https://x.com/user/status/000', '000')
    expect(result).toBeNull()
  })

  it('extracts screen name from URL for author fallback', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(htmlWithOgMeta({ 'twitter:creator': '' }), { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )

    const result = await parseTwitterHtml('https://x.com/someuser/status/111', '111')
    expect(result!.author.screen_name).toBe('someuser')
  })
})
