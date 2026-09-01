import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { UpdateCheckControl } from './UpdateCheckControl'

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

const check = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
}

describe('manual check — every outcome is shown, unlike the silent startup path', () => {
  it('reports up to date', async () => {
    render(<UpdateCheckControl />)

    check()

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('up to date'))
    expect(api.calls.updatesCheck).toBe(1)
  })

  it('reports a failed check without pretending', async () => {
    api.setUpdateCheckResult({ status: 'check-failed', currentVersion: '0.1.0', latest: null })
    render(<UpdateCheckControl />)

    check()

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain("Couldn't reach"))
  })

  it('reports an available version with a working View release action', async () => {
    api.setUpdateCheckResult({
      status: 'update-available',
      currentVersion: '0.1.0',
      latest: { version: '0.2.0', releaseUrl: 'https://example.invalid', publishedAt: 0 }
    })
    render(<UpdateCheckControl />)

    check()

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('0.2.0'))
    fireEvent.click(screen.getByRole('button', { name: 'View release' }))
    await waitFor(() => expect(api.calls.updatesOpenRelease).toBe(1))
  })
})
