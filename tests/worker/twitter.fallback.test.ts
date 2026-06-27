import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTwitter } from '../../worker/src/twitter'

describe('parseTwitter — fallback chain (Tier 3)', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('falls through to HTMLRewriter when both API tiers fail', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'err' })
      .mockResolvedValueOnce(
        new Response(`<html><head>
          <meta property="og:title" content="HTML Tweet" />
          <meta property="og:image" content="https://ex.com/img.jpg" />
        </head></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } }),
      )

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.platform).toBe('twitter')
    expect(result.type).toBe('images')
    expect(result.images[0]).toBe('https://ex.com/img.jpg')
  })

  it('all 3 tiers fail — error message includes all details', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'forbidden' })
      .mockResolvedValueOnce(new Response('<html><head></head><body></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))

    try {
      await parseTwitter('https://x.com/user/status/999')
      expect.unreachable('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('500')
      expect(msg).toContain('403')
    }
  })

  it('handles fxtwitter timeout then vxtwitter success', async () => {
    mockFetch
      .mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tweet: {
            text: 'From vx after timeout',
            media: { all: [{ type: 'photo', url: 'https://ex.com/p.jpg' }] },
            author: { name: 'V', screen_name: 'v', avatar_url: '' },
          },
        }),
      })

    const result = await parseTwitter('https://x.com/user/status/999')
    expect(result.title).toBe('From vx after timeout')
  })
})
