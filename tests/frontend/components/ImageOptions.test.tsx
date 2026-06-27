import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageOptions } from '../../../src/components/ImageOptions'

describe('ImageOptions', () => {
  const mockImages = [
    'https://ex.com/img1.jpg',
    'https://ex.com/img2.png',
  ]

  const formatBytes = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

  it('renders image count and all thumbnails', () => {
    render(
      <ImageOptions
        images={mockImages}
        downloadingKey={null}
        downloadProgress={null}
        downloadImage={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    expect(screen.getByText('解析到 2 张原图 (无水印)')).toBeInTheDocument()
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(2)
  })

  it('triggers download on image button click', async () => {
    const downloadImage = vi.fn()
    const user = userEvent.setup()

    render(
      <ImageOptions
        images={mockImages}
        downloadingKey={null}
        downloadProgress={null}
        downloadImage={downloadImage}
        formatBytes={formatBytes}
      />
    )

    const buttons = screen.getAllByText('下载原图 #1')
    await user.click(buttons[0])

    expect(downloadImage).toHaveBeenCalledWith('https://ex.com/img1.jpg', 0)
  })

  it('disables buttons during download', () => {
    render(
      <ImageOptions
        images={mockImages}
        downloadingKey="img_0"
        downloadProgress={null}
        downloadImage={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => expect(btn).toBeDisabled())
  })

  it('uses proxied image URLs for thumbnails', () => {
    render(
      <ImageOptions
        images={mockImages}
        downloadingKey={null}
        downloadProgress={null}
        downloadImage={vi.fn()}
        formatBytes={formatBytes}
      />
    )

    const imgs = screen.getAllByRole('img') as HTMLImageElement[]
    expect(imgs[0].src).toContain('/api/image-proxy')
    expect(imgs[0].src).toContain(encodeURIComponent('https://ex.com/img1.jpg'))
  })
})
