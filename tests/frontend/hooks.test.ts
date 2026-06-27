import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useParseState, useLoadingState, useHistoryState } from '../../src/hooks'
import type { MediaResult, HistoryItem } from '../../src/types'

describe('useParseState', () => {
  it('initializes with empty state', () => {
    const { result } = renderHook(() => useParseState())
    expect(result.current.inputText).toBe('')
    expect(result.current.extractedUrl).toBeNull()
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('updates inputText via setInputText', () => {
    const { result } = renderHook(() => useParseState())
    act(() => result.current.setInputText('hello'))
    expect(result.current.inputText).toBe('hello')
  })

  it('updates result via setResult', () => {
    const { result } = renderHook(() => useParseState())
    const mediaResult: MediaResult = {
      platform: 'twitter', id: '123', type: 'video',
      title: 'Test', desc: '', cover: '',
      author: { name: 'A', avatar: '' },
      videos: [], images: [],
    }
    act(() => result.current.setResult(mediaResult))
    expect(result.current.result?.title).toBe('Test')
  })
})

describe('useLoadingState', () => {
  it('initializes with not loading', () => {
    const { result } = renderHook(() => useLoadingState())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadingStep).toBe('')
  })
})

describe('useHistoryState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads empty history when localStorage is empty', () => {
    const { result } = renderHook(() => useHistoryState())
    expect(result.current.history).toEqual([])
  })

  it('loads saved history from localStorage', () => {
    const savedHistory: HistoryItem[] = [
      { id: '1', platform: 'twitter', type: 'video', title: 'T', url: 'https://x.com/1', timestamp: Date.now() },
    ]
    localStorage.setItem('download_history', JSON.stringify(savedHistory))

    const { result } = renderHook(() => useHistoryState())
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].title).toBe('T')
  })
})
