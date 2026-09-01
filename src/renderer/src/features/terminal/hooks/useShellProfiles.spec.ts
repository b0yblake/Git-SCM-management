import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFakeGitDeckApi,
  FAKE_PROFILES,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { useShellProfiles } from './useShellProfiles'

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  api.uninstall()
})

describe('loading', () => {
  it('asks Main for the profile list rather than computing one', async () => {
    const { result } = renderHook(() => useShellProfiles())

    await waitFor(() => expect(result.current.profiles).toEqual(FAKE_PROFILES))
    expect(api.calls.profiles).toBe(1)
  })

  it('starts empty so nothing is rendered before detection answers', () => {
    const { result } = renderHook(() => useShellProfiles())

    expect(result.current.profiles).toEqual([])
    expect(result.current.defaultShellProfileId).toBeNull()
  })

  it('reads the stored default from settings', async () => {
    await api.settings.update({ defaultShellProfileId: 'cmd' })

    const { result } = renderHook(() => useShellProfiles())

    await waitFor(() => expect(result.current.defaultShellProfileId).toBe('cmd'))
  })

  it('leaves the list empty when Main reports a failure', async () => {
    api.terminal.profiles = () =>
      Promise.resolve({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } })

    const { result } = renderHook(() => useShellProfiles())

    await waitFor(() => expect(api.calls.profiles).toBe(0))
    expect(result.current.profiles).toEqual([])
  })

  it('does not set state after unmount', async () => {
    const { unmount } = renderHook(() => useShellProfiles())

    unmount()

    await expect(Promise.resolve()).resolves.toBeUndefined()
  })
})

describe('setting the default', () => {
  it('persists the choice through settings', async () => {
    const { result } = renderHook(() => useShellProfiles())
    await waitFor(() => expect(result.current.profiles).toHaveLength(3))

    await act(() => result.current.setDefault('git-bash'))

    expect(api.calls.settingsUpdate).toEqual([{ defaultShellProfileId: 'git-bash' }])
    expect(api.storedSettings().defaultShellProfileId).toBe('git-bash')
  })

  it('reflects the new default immediately', async () => {
    const { result } = renderHook(() => useShellProfiles())
    await waitFor(() => expect(result.current.profiles).toHaveLength(3))

    await act(() => result.current.setDefault('cmd'))

    expect(result.current.defaultShellProfileId).toBe('cmd')
  })

  it('keeps the previous default when the update is rejected', async () => {
    await api.settings.update({ defaultShellProfileId: 'cmd' })
    const { result } = renderHook(() => useShellProfiles())
    await waitFor(() => expect(result.current.defaultShellProfileId).toBe('cmd'))
    api.settings.update = () =>
      Promise.resolve({ ok: false, error: { code: 'INVALID_REQUEST', message: 'no' } })

    await act(() => result.current.setDefault('wsl'))

    expect(result.current.defaultShellProfileId).toBe('cmd')
  })
})
