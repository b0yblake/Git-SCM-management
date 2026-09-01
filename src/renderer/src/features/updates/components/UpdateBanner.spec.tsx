import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UpdateCheckResult } from '@shared/contracts/updates'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useUpdatesStore } from '../store/updatesStore'
import { UpdateBanner } from './UpdateBanner'

let api: FakeGitDeckApi

const AVAILABLE: UpdateCheckResult = {
  status: 'update-available',
  currentVersion: '0.1.0',
  latest: {
    version: '0.2.0',
    releaseUrl: 'https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.2.0',
    publishedAt: 0
  }
}

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useUpdatesStore.setState({ available: null })
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('rendering', () => {
  it('renders nothing until the startup push arrives', () => {
    render(<UpdateBanner />)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('names both versions when an update is available', () => {
    render(<UpdateBanner />)

    act(() => api.emitUpdateAvailable(AVAILABLE))

    const banner = screen.getByRole('status')
    expect(banner.textContent).toContain('0.2.0')
    expect(banner.textContent).toContain('0.1.0')
  })

  it('never renders for a non-available result', () => {
    render(<UpdateBanner />)

    act(() =>
      api.emitUpdateAvailable({ status: 'up-to-date', currentVersion: '0.1.0', latest: null })
    )

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('actions', () => {
  it('View release asks Main to open the page it minted — no URL crosses', async () => {
    render(<UpdateBanner />)
    act(() => api.emitUpdateAvailable(AVAILABLE))

    fireEvent.click(screen.getByRole('button', { name: 'View release' }))

    await waitFor(() => expect(api.calls.updatesOpenRelease).toBe(1))
  })

  it('Skip persists the version through the settings patch and hides the banner', async () => {
    render(<UpdateBanner />)
    act(() => api.emitUpdateAvailable(AVAILABLE))

    fireEvent.click(screen.getByRole('button', { name: 'Skip this version' }))

    await waitFor(() =>
      expect(api.calls.settingsUpdate).toEqual([{ skippedUpdateVersion: '0.2.0' }])
    )
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('Later hides the banner and persists nothing', () => {
    render(<UpdateBanner />)
    act(() => api.emitUpdateAvailable(AVAILABLE))

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(api.calls.settingsUpdate).toEqual([])
  })

  it('Escape while focus is inside the banner dismisses it', () => {
    render(<UpdateBanner />)
    act(() => api.emitUpdateAvailable(AVAILABLE))

    fireEvent.keyDown(screen.getByRole('button', { name: 'Later' }), { key: 'Escape' })

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('cleanup', () => {
  it('unmounting removes the subscription', () => {
    const { unmount } = render(<UpdateBanner />)

    unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
