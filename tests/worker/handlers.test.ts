import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleImageProxy, handleProxyDownload } from '../../worker/src/handlers'

describe('handleImageProxy', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('proxies image with RedNote Referer', async () => {
    const mockBody = new ReadableStream({ start(controller) { controller.close() } })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'image/jpeg' }),
      body: mockBody,
    })

    const response = await handleImageProxy('https://example.com/image.jpg')

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')

    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe('https://example.com/image.jpg')
    expect(fetchCall[1]?.headers?.['Referer']).toBe('https://www.xiaohongshu.com/')
  })

  it('throws when origin fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(handleImageProxy('https://example.com/missing.jpg'))
      .rejects.toThrow('Failed to fetch image')
  })
})

describe('handleProxyDownload', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('proxies download with Content-Disposition', async () => {
    const mockBody = new ReadableStream({ start(controller) { controller.close() } })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'video/mp4' }),
      body: mockBody,
    })

    const response = await handleProxyDownload('https://example.com/video.mp4', 'test_video.mp4')

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Content-Disposition')).toContain('test_video.mp4')
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
  })

  it('throws when download source fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(handleProxyDownload('https://example.com/missing.mp4', 'x.mp4'))
      .rejects.toThrow('Failed to fetch media file')
  })
})
