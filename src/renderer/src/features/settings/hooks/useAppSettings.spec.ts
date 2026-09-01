import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/contracts/settings'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useSettingsStore } from '../store/settingsStore'
import { useAppSettings } from './useAppSettings'

let api: FakeGitDeckApi

const mount = () => renderHook(() => useAppSettings())

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useSettingsStore.getState().reset()
})

afterEach(() => {
  api.uninstall()
})

describe('loading', () => {
  it('starts from the defaults, so nothing renders blank', () => {
    const { result } = mount()

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('reads what Main has persisted', async () => {
    await api.settings.update({ terminalFontSize: 20 })

    const { result } = mount()

    await waitFor(() => expect(result.current.settings.terminalFontSize).toBe(20))
  })
})

describe('updating', () => {
  it('sends only the fields it was given', async () => {
    const { result } = mount()

    await act(() => result.current.update({ terminalFontSize: 18 }))

    expect(api.calls.settingsUpdate).toEqual([{ terminalFontSize: 18 }])
  })

  it('takes the whole normalised object back from Main', async () => {
    const { result } = mount()

    await act(() => result.current.update({ terminalCursorBlink: false }))

    expect(result.current.settings).toEqual({ ...DEFAULT_SETTINGS, terminalCursorBlink: false })
  })
})

/**
 * The bug this store exists to prevent, found by looking at a screenshot of the
 * running app: the settings screen and the terminal each held their own copy,
 * so unticking "ask before closing" left the terminal still asking until the
 * app was restarted.
 */
describe('every caller shares one copy', () => {
  it('an update in one place is visible in another', async () => {
    const screen = mount()
    const terminal = mount()

    await act(() => screen.result.current.update({ confirmBeforeClosingRunningTerminal: false }))

    expect(terminal.result.current.settings.confirmBeforeClosingRunningTerminal).toBe(false)
  })

  it('a font size chosen in one place is the font size the other renders', async () => {
    const screen = mount()
    const terminal = mount()

    await act(() => screen.result.current.update({ terminalFontSize: 22 }))

    expect(terminal.result.current.settings.terminalFontSize).toBe(22)
  })

  it('a caller mounted afterwards sees it too', async () => {
    const screen = mount()
    await act(() => screen.result.current.update({ terminalFontSize: 22 }))

    const later = mount()

    expect(later.result.current.settings.terminalFontSize).toBe(22)
  })
})
