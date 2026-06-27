import { describe, it, expect, beforeEach } from 'vitest'
import { addToHistory, clearHistory } from '../../src/history'
import type { HistoryItem } from '../../src/types'

describe('history', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds item to empty history', () => {
    const result = addToHistory({
      id: '123',
      platform: 'twitter',
      type: 'video',
      title: 'Test',
      url: 'https://x.com/user/status/123',
    })

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://x.com/user/status/123')
    expect(result[0].timestamp).toBeGreaterThan(0)
  })

  it('prepends new item to existing history', () => {
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'First', url: 'https://x.com/1' })
    addToHistory({ id: '2', platform: 'rednote', type: 'images', title: 'Second', url: 'https://xhs.com/2' })

    const history = JSON.parse(localStorage.getItem('download_history')!) as HistoryItem[]
    expect(history).toHaveLength(2)
    expect(history[0].title).toBe('Second')
  })

  it('deduplicates by URL', () => {
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'Original', url: 'https://x.com/1' })
    addToHistory({ id: '2', platform: 'twitter', type: 'video', title: 'Updated', url: 'https://x.com/1' })

    const history = JSON.parse(localStorage.getItem('download_history')!) as HistoryItem[]
    expect(history).toHaveLength(1)
    expect(history[0].title).toBe('Updated')
  })

  it('limits history to 10 items', () => {
    for (let i = 0; i < 15; i++) {
      addToHistory({ id: `${i}`, platform: 'twitter', type: 'video', title: `Item ${i}`, url: `https://x.com/${i}` })
    }

    const history = JSON.parse(localStorage.getItem('download_history')!) as HistoryItem[]
    expect(history).toHaveLength(10)
  })

  it('clearHistory removes all items', () => {
    addToHistory({ id: '1', platform: 'twitter', type: 'video', title: 'T', url: 'https://x.com/1' })
    const result = clearHistory()
    expect(result).toEqual([])
    expect(localStorage.getItem('download_history')).toBeNull()
  })
})
