import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VideoOptions } from '../../../src/components/VideoOptions'
import type { VideoFormat } from '../../../src/types'

describe('VideoOptions', () => {
  const mockVideos: VideoFormat[] = [
    { url: 'https://ex.com/1080p.mp4', width: 1920, height: 1080, quality: '1080p', size: 50_000_000 },
    { url: 'https://ex.com/720p.mp4', width: 1280, height: 720, quality: '720p', size: 25_000_000 },
  ]

  const formatBytes = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

  it('renders all video formats', () => {
    render(
      <VideoOptions
        videos={mockVideos}
        downloadingKey={null}
        downloadProgress={null}
        triggerDownload={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    expect(screen.getByText('1080p')).toBeInTheDocument()
    expect(screen.getByText('720p')).toBeInTheDocument()
    expect(screen.getByText('1920x1080')).toBeInTheDocument()
    expect(screen.getByText('1280x720')).toBeInTheDocument()
    expect(screen.getByText('47.68 MB')).toBeInTheDocument()
  })

  it('shows empty state when no videos provided', () => {
    render(
      <VideoOptions
        videos={[]}
        downloadingKey={null}
        downloadProgress={null}
        triggerDownload={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    expect(screen.getByText('未提取到匹配的视频流地址')).toBeInTheDocument()
  })

  it('triggers download on button click', async () => {
    const triggerDownload = vi.fn()
    const user = userEvent.setup()

    render(
      <VideoOptions
        videos={mockVideos}
        downloadingKey={null}
        downloadProgress={null}
        triggerDownload={triggerDownload}
        formatBytes={formatBytes}
      />
    )

    const buttons = screen.getAllByText('下载 MP4')
    await user.click(buttons[0])

    expect(triggerDownload).toHaveBeenCalledWith('https://ex.com/1080p.mp4', '1080p')
  })

  it('disables buttons when another download is in progress', () => {
    render(
      <VideoOptions
        videos={mockVideos}
        downloadingKey="video_720p"
        downloadProgress={null}
        triggerDownload={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => expect(btn).toBeDisabled())
  })

  it('shows download progress for active format', () => {
    render(
      <VideoOptions
        videos={mockVideos}
        downloadingKey="video_1080p"
        downloadProgress={{ loaded: 25_000_000, total: 50_000_000 }}
        triggerDownload={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    expect(screen.getByText('50%')).toBeInTheDocument()
  })
})
