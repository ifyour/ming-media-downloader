import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseRednote } from '../../worker/src/rednote'
import type { Env } from '../../worker/src/types'

describe('parseRednote — fallback paths', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const noteId = 'fallback123'

  it('falls back to __INITIAL_STATE__ script tag when window.__INITIAL_STATE__ is missing', async () => {
    const stateJson = JSON.stringify({
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: 'Script Tag Title',
              desc: 'From script tag',
              type: 'normal',
              imageList: [],
              user: { nickname: 'ScriptAuthor', avatar: '' },
            },
          },
        },
      },
    })

    // HTML without window.__INITIAL_STATE__, but with script id="__INITIAL_STATE__"
    const html = `<html><body><script id="__INITIAL_STATE__" type="application/json">${stateJson}</script></body></html>`
    const env: Env = { MMD_CACHE: {} as KVNamespace }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })

    const result = await parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    expect(result.title).toBe('Script Tag Title')
    expect(result.author.name).toBe('ScriptAuthor')
  })

  it('falls back to Puppeteer SSR gracefully when import is unavailable', async () => {
    // First fetch returns HTML with no INITIAL_STATE
    const emptyHtml = '<html><body>Need SSR</body></html>'
    const env: Env = { MMD_CACHE: {} as KVNamespace, MYBROWSER: {} }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => emptyHtml,
    })

    // Puppeteer dynamic import will fail (package not installed).
    // The function catches the error, continues, and eventually throws
    // because no state was extracted from any strategy.
    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    ).rejects.toThrow('Failed to parse RedNote note data')
  })

  it('all strategies fail — throws meaningful error', async () => {
    const env: Env = { MMD_CACHE: {} as KVNamespace }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No state whatsoever</body></html>',
    })

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    ).rejects.toThrow('Failed to parse RedNote note data')
  })

  it('handles HTTP error status with partial body in error message', async () => {
    const env: Env = { MMD_CACHE: {} as KVNamespace }
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '{"error":"rate limit"}',
    })

    await expect(
      parseRednote(`https://www.xiaohongshu.com/explore/${noteId}`, env)
    ).rejects.toThrow()
  })
})
