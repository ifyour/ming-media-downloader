import { describe, it, expect } from 'vitest'
import { extractUrl } from '../../src/extractUrl'

describe('extractUrl', () => {
  it('extracts https URL from text', () => {
    expect(extractUrl('Check this https://x.com/user/status/123')).toBe('https://x.com/user/status/123')
  })

  it('extracts http URL from text', () => {
    expect(extractUrl('http://example.com/test')).toBe('http://example.com/test')
  })

  it('strips trailing punctuation from URL', () => {
    expect(extractUrl('Visit https://x.com/user/status/123!')).toBe('https://x.com/user/status/123')
    expect(extractUrl('See https://x.com/user/status/123...')).toBe('https://x.com/user/status/123')
  })

  it('does not strip trailing slash', () => {
    expect(extractUrl('https://x.com/user/status/123/')).toBe('https://x.com/user/status/123/')
  })

  it('extracts first URL when multiple present', () => {
    expect(extractUrl('https://first.com https://second.com')).toBe('https://first.com')
  })

  it('returns null when no URL present', () => {
    expect(extractUrl('Just some text')).toBeNull()
  })

  it('handles empty string', () => {
    expect(extractUrl('')).toBeNull()
  })

  it('handles Chinese text with URL', () => {
    expect(extractUrl('小红书分享 https://www.xiaohongshu.com/explore/abc123 快来')).toBe('https://www.xiaohongshu.com/explore/abc123')
  })

  it('strips Chinese punctuation after URL', () => {
    expect(extractUrl('https://www.xiaohongshu.com/explore/abc123。')).toBe('https://www.xiaohongshu.com/explore/abc123')
  })
})
