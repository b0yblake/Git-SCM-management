import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { DataFolderSetting } from './DataFolderSetting'

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('display', () => {
  it('shows the folder data is currently stored in', async () => {
    api.setDataFolderInfo({
      current: 'C:\\Users\\dev\\AppData\\Roaming\\GitDeck',
      defaultRoot: 'C:\\Users\\dev\\AppData\\Roaming\\GitDeck',
      isCustom: false,
      pending: null
    })
    render(<DataFolderSetting />)

    await waitFor(() =>
      expect(screen.getByLabelText('Data folder')).toHaveProperty(
        'value',
        'C:\\Users\\dev\\AppData\\Roaming\\GitDeck'
      )
    )
    expect(api.calls.storageDataFolder).toBe(1)
  })

  it('the path is read-only — typing is not how a folder is chosen', async () => {
    render(<DataFolderSetting />)

    await waitFor(() => expect(api.calls.storageDataFolder).toBe(1))

    expect(screen.getByLabelText('Data folder')).toHaveProperty('readOnly', true)
  })
})

describe('choosing', () => {
  it('a cancelled picker changes nothing and shows no pending note', async () => {
    render(<DataFolderSetting />)
    await waitFor(() => expect(api.calls.storageDataFolder).toBe(1))
    api.setChooseDataFolderResult(null)

    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))

    await waitFor(() => expect(api.calls.storageChooseDataFolder).toBe(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a chosen folder shows the applies-after-restart note with the new path', async () => {
    render(<DataFolderSetting />)
    await waitFor(() => expect(api.calls.storageDataFolder).toBe(1))
    api.setChooseDataFolderResult({
      current: 'C:\\Users\\dev\\AppData\\Roaming\\GitDeck',
      defaultRoot: 'C:\\Users\\dev\\AppData\\Roaming\\GitDeck',
      isCustom: false,
      pending: 'D:\\GitDeckData'
    })

    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('D:\\GitDeckData'))
    expect(screen.getByRole('status').textContent).toContain('next time GitDeck starts')
  })

  it('a failed switch is reported, not swallowed', async () => {
    render(<DataFolderSetting />)
    await waitFor(() => expect(api.calls.storageDataFolder).toBe(1))
    api.failChooseDataFolder('could not switch the data folder: disk full')

    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disk full'))
  })
})
