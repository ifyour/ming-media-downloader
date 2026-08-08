import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppContent from '../../../src/AppContent'
import type { MediaResult, HistoryItem } from '../../../src/types'

vi.mock('../../../src/components/PWAProvider', () => ({
  usePWA: vi.fn(() => ({
    needRefresh: false,
    offlineReady: false,
    updateServiceWorker: vi.fn(),
  })),
}))

const defaultProps = {
  inputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
  inputText: '',
  extractedUrl: null,
  isLoading: false,
  loadingStep: '',
  error: null,
  result: null,
  shareId: null,
  history: [] as HistoryItem[],
  downloadingKey: null,
  downloadProgress: null,
  triggerDownload: vi.fn(),
  downloadImage: vi.fn(),
  onInputChange: vi.fn(),
  onParse: vi.fn(),
  onClearResult: vi.fn(),
  onClearHistory: vi.fn(),
  onHistoryClick: vi.fn(),
  onLogoClick: vi.fn(),
}

describe('AppContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost', pathname: '/' },
      writable: true,
    })
  })

  it('renders header and input form', () => {
    render(<AppContent {...defaultProps} />)
    expect(screen.getByText('Ming Media Downloader')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('粘贴小红书分享文本或 𝕏 推文链接...')).toBeInTheDocument()
    expect(screen.getByText('解析链接')).toBeInTheDocument()
  })

  it('disables parse button when input is empty', () => {
    render(<AppContent {...defaultProps} inputText="" />)
    expect(screen.getByText('解析链接')).toBeDisabled()
  })

  it('enables parse button when input has text', () => {
    render(<AppContent {...defaultProps} inputText="https://x.com/user/status/123" />)
    expect(screen.getByText('解析链接')).not.toBeDisabled()
  })

  it('shows extracted URL hint', () => {
    render(
      <AppContent
        {...defaultProps}
        extractedUrl="https://x.com/user/status/123"
      />
    )
    expect(screen.getByText('识别到链接：')).toBeInTheDocument()
    expect(screen.getByText('https://x.com/user/status/123')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(
      <AppContent
        {...defaultProps}
        error="解析失败，请检查链接是否正确"
      />
    )
    expect(screen.getByText('解析失败，请检查链接是否正确')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(
      <AppContent
        {...defaultProps}
        isLoading={true}
        loadingStep="正在解析中..."
      />
    )
    expect(screen.getByText('正在解析中...')).toBeInTheDocument()
  })

  it('renders result card with video options', () => {
    const videoResult: MediaResult = {
      platform: 'twitter', id: '123', type: 'video',
      title: 'Test Video', desc: 'A test video',
      cover: 'https://ex.com/cover.jpg',
      author: { name: 'TestUser', screen_name: 'test', avatar: 'https://ex.com/avatar.jpg' },
      videos: [{ url: 'https://ex.com/v.mp4', width: 1920, height: 1080, quality: '1080p', size: 50_000_000 }],
      images: [],
    }

    render(<AppContent {...defaultProps} result={videoResult} />)

    expect(screen.getByText('Test Video')).toBeInTheDocument()
    expect(screen.getByText('🐦 X (Twitter)')).toBeInTheDocument()
    expect(screen.getByText('TestUser')).toBeInTheDocument()
    expect(screen.getByText('@test')).toBeInTheDocument()
    expect(screen.getByText('🎬 视频')).toBeInTheDocument()
    expect(screen.getByText('1080p')).toBeInTheDocument()
    expect(screen.getByText('1920x1080')).toBeInTheDocument()
  })

  it('renders result card with image options', () => {
    const imageResult: MediaResult = {
      platform: 'rednote', id: 'abc', type: 'images',
      title: 'Test Images', desc: 'Image collection',
      cover: 'https://ex.com/cover.jpg',
      author: { name: 'RedAuthor', avatar: 'https://ex.com/avatar.jpg' },
      videos: [],
      images: ['https://ex.com/img1.jpg', 'https://ex.com/img2.jpg'],
    }

    render(<AppContent {...defaultProps} result={imageResult} />)

    expect(screen.getByText('📕 小红书')).toBeInTheDocument()
    expect(screen.getByText('🖼️ 图片集')).toBeInTheDocument()
    expect(screen.getByText('解析到 2 张原图 (无水印)')).toBeInTheDocument()
  })

  it('renders share box when shareId is present', () => {
    const result: MediaResult = {
      platform: 'rednote', id: 'abc', type: 'images',
      title: '', desc: '', cover: '',
      author: { name: 'A', avatar: '' },
      videos: [], images: [],
    }

    render(<AppContent {...defaultProps} result={result} shareId="abc12345" />)

    expect(screen.getByText('分享链接')).toBeInTheDocument()
    expect(screen.getByText('复制链接')).toBeInTheDocument()
  })

  it('renders history section', () => {
    const history: HistoryItem[] = [
      { id: '1', platform: 'twitter', type: 'video', title: 'Hist 1', url: 'https://x.com/1', timestamp: Date.now() },
      { id: '2', platform: 'rednote', type: 'images', title: 'Hist 2', url: 'https://xhs.com/2', timestamp: Date.now() },
    ]

    render(<AppContent {...defaultProps} history={history} />)

    expect(screen.getByText('最近解析记录')).toBeInTheDocument()
    expect(screen.getByText('Hist 1')).toBeInTheDocument()
    expect(screen.getByText('Hist 2')).toBeInTheDocument()
  })

  it('calls onHistoryClick when history item is clicked', async () => {
    const onHistoryClick = vi.fn()
    const history: HistoryItem[] = [
      { id: '1', platform: 'twitter', type: 'video', title: 'Click Me', url: 'https://x.com/1', timestamp: Date.now() },
    ]
    const user = userEvent.setup()

    render(
      <AppContent {...defaultProps} history={history} onHistoryClick={onHistoryClick} />
    )

    await user.click(screen.getByText('Click Me'))
    expect(onHistoryClick).toHaveBeenCalledWith('https://x.com/1')
  })

  it('calls onClearHistory when clear button is clicked', async () => {
    const onClearHistory = vi.fn()
    const history: HistoryItem[] = [
      { id: '1', platform: 'twitter', type: 'video', title: 'T', url: 'https://x.com/1', timestamp: Date.now() },
    ]
    const user = userEvent.setup()

    render(
      <AppContent {...defaultProps} history={history} onClearHistory={onClearHistory} />
    )

    await user.click(screen.getByText('清空记录'))
    expect(onClearHistory).toHaveBeenCalled()
  })

  it('calls onLogoClick when the logo is clicked', async () => {
    const onLogoClick = vi.fn()
    const user = userEvent.setup()

    render(<AppContent {...defaultProps} onLogoClick={onLogoClick} />)

    await user.click(screen.getByRole('button', { name: '回到首页' }))
    expect(onLogoClick).toHaveBeenCalled()
  })
})
