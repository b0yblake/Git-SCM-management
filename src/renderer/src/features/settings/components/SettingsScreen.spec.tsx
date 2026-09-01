import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/contracts/settings'
import {
  createFakeGitDeckApi,
  emptyCalls,
  FAKE_PROFILES,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { SettingsScreen } from './SettingsScreen'

let api: FakeGitDeckApi
const onChange = vi.fn()

const show = (settings: Partial<AppSettings> = {}) =>
  render(
    <SettingsScreen
      settings={{ ...DEFAULT_SETTINGS, ...settings }}
      profiles={FAKE_PROFILES}
      onChange={onChange}
    />
  )

const SHELL = 'Default shell'
const FONT = 'Font size'
const BLINK = 'Blinking cursor'
const CONFIRM = 'Ask before closing a running terminal'
const RESTORE = 'Reopen the last workspace'
const COMMANDS = 'Also run its startup commands'

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  onChange.mockClear()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('every field renders its current value', () => {
  it('the default shell', () => {
    show({ defaultShellProfileId: 'cmd' })

    expect(screen.getByLabelText<HTMLSelectElement>(SHELL).value).toBe('cmd')
  })

  it('an unset default shell reads as "first available"', () => {
    show({ defaultShellProfileId: null })

    expect(screen.getByLabelText<HTMLSelectElement>(SHELL).value).toBe('')
  })

  it('the font size', () => {
    show({ terminalFontSize: 18 })

    expect(screen.getByLabelText<HTMLInputElement>(FONT).value).toBe('18')
  })

  it('both terminal toggles', () => {
    show({ terminalCursorBlink: false, confirmBeforeClosingRunningTerminal: false })

    expect(screen.getByLabelText<HTMLInputElement>(BLINK).checked).toBe(false)
    expect(screen.getByLabelText<HTMLInputElement>(CONFIRM).checked).toBe(false)
  })

  it('both startup toggles', () => {
    show({ restoreLastWorkspace: false, runStartupCommandsOnRestore: true })

    expect(screen.getByLabelText<HTMLInputElement>(RESTORE).checked).toBe(false)
    expect(screen.getByLabelText<HTMLInputElement>(COMMANDS).checked).toBe(true)
  })

  /** The shell list is detection's answer, not a constant in the component. */
  it('offers exactly the detected shells, plus "first available"', () => {
    show()

    const options = [...screen.getByLabelText<HTMLSelectElement>(SHELL).options]
    expect(options.map((option) => option.value)).toEqual(['', 'git-bash', 'powershell', 'cmd'])
  })
})

describe('changing a field patches only that field', () => {
  it('the default shell', () => {
    show()

    fireEvent.change(screen.getByLabelText(SHELL), { target: { value: 'git-bash' } })

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ defaultShellProfileId: 'git-bash' })
  })

  it('clearing the default shell sends null', () => {
    show({ defaultShellProfileId: 'cmd' })

    fireEvent.change(screen.getByLabelText(SHELL), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ defaultShellProfileId: null })
  })

  it('the font size', () => {
    show()

    fireEvent.change(screen.getByLabelText(FONT), { target: { value: '20' } })

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ terminalFontSize: 20 })
  })

  it('the cursor blink', () => {
    show({ terminalCursorBlink: true })

    fireEvent.click(screen.getByLabelText(BLINK))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ terminalCursorBlink: false })
  })

  it('the close confirmation', () => {
    show({ confirmBeforeClosingRunningTerminal: true })

    fireEvent.click(screen.getByLabelText(CONFIRM))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      confirmBeforeClosingRunningTerminal: false
    })
  })

  it('the restore toggle', () => {
    show({ restoreLastWorkspace: true })

    fireEvent.click(screen.getByLabelText(RESTORE))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ restoreLastWorkspace: false })
  })
})

/** Main validates too; this stops an unusable value ever being sent. */
describe('an unusable font size never leaves the screen', () => {
  it.each(['0', '900', '4', '64'])('rejects %s', (value) => {
    show()

    fireEvent.change(screen.getByLabelText(FONT), { target: { value } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('says why, rather than silently ignoring the input', () => {
    show()

    fireEvent.change(screen.getByLabelText(FONT), { target: { value: '900' } })

    expect(screen.getByRole('alert').textContent).toContain('between 8 and 32')
    expect(screen.getByLabelText(FONT).getAttribute('aria-invalid')).toBe('true')
  })

  it('keeps what the user typed while they are still typing', () => {
    show({ terminalFontSize: 14 })

    fireEvent.change(screen.getByLabelText(FONT), { target: { value: '1' } })

    // Clamping mid-keystroke would fight someone on their way to 16.
    expect(screen.getByLabelText<HTMLInputElement>(FONT).value).toBe('1')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts the value once it becomes valid', () => {
    show()

    fireEvent.change(screen.getByLabelText(FONT), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(FONT), { target: { value: '16' } })

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ terminalFontSize: 16 })
  })
})

describe('boundary', () => {
  it('drives every control without touching the bridge', () => {
    show()

    fireEvent.change(screen.getByLabelText(SHELL), { target: { value: 'cmd' } })
    fireEvent.change(screen.getByLabelText(FONT), { target: { value: '16' } })
    fireEvent.click(screen.getByLabelText(BLINK))
    fireEvent.click(screen.getByLabelText(CONFIRM))
    fireEvent.click(screen.getByLabelText(RESTORE))

    expect(api.calls).toEqual(emptyCalls())
  })
})
