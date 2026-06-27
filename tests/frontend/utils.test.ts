import { describe, it, expect } from 'vitest'
import { getErrorMessage, proxiedImage, formatBytes } from '../../src/utils'

describe('getErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(getErrorMessage(new Error('fail'))).toBe('fail')
  })

  it('returns string directly', () => {
    expect(getErrorMessage('custom error')).toBe('custom error')
  })

  it('returns default message for unknown types', () => {
    expect(getErrorMessage(null)).toBe('网络连接错误，请检查您的网络或稍后再试')
    expect(getErrorMessage(undefined)).toBe('网络连接错误，请检查您的网络或稍后再试')
  })
})

describe('proxiedImage', () => {
  it('wraps URL with image proxy path', () => {
    expect(proxiedImage('https://example.com/img.jpg')).toBe('/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimg.jpg')
  })

  it('encodes special characters in URL', () => {
    expect(proxiedImage('https://ex.com/img?w=100&h=200')).toContain('w%3D100')
  })

  it('returns empty string for empty input', () => {
    expect(proxiedImage('')).toBe('')
  })
})

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
    expect(formatBytes(2097152)).toBe('2 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })
})
