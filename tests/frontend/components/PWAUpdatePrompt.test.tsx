import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PWAUpdatePrompt } from '../../../src/components/PWAUpdatePrompt'

vi.mock('../../../src/components/PWAProvider', () => ({
  usePWA: vi.fn(),
}))

import { usePWA } from '../../../src/components/PWAProvider'

describe('PWAUpdatePrompt', () => {
  it('renders nothing when no update is needed', () => {
    vi.mocked(usePWA).mockReturnValue({
      needRefresh: false,
      offlineReady: false,
      updateServiceWorker: vi.fn(),
    })

    const { container } = render(<PWAUpdatePrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('renders update prompt when update is available', () => {
    vi.mocked(usePWA).mockReturnValue({
      needRefresh: true,
      offlineReady: false,
      updateServiceWorker: vi.fn(),
    })

    render(<PWAUpdatePrompt />)
    expect(screen.getByText('发现新版本，是否立即更新？')).toBeInTheDocument()
    expect(screen.getByText('立即刷新')).toBeInTheDocument()
  })

  it('calls updateServiceWorker on button click', async () => {
    const updateServiceWorker = vi.fn()
    vi.mocked(usePWA).mockReturnValue({
      needRefresh: true,
      offlineReady: false,
      updateServiceWorker,
    })

    const user = userEvent.setup()
    render(<PWAUpdatePrompt />)
    await user.click(screen.getByText('立即刷新'))

    expect(updateServiceWorker).toHaveBeenCalledOnce()
  })
})
