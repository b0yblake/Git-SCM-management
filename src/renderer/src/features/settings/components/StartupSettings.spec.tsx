import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeGitDeckApi,
  emptyCalls,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { StartupSettings } from './StartupSettings'

let api: FakeGitDeckApi
const onChange = vi.fn()

const RESTORE = 'Reopen the last workspace'
const COMMANDS = 'Also run its startup commands'

const show = (restore = true, commands = false) =>
  render(
    <StartupSettings
      restoreLastWorkspace={restore}
      runStartupCommandsOnRestore={commands}
      onChange={onChange}
    />
  )

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  onChange.mockClear()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('the toggles reflect what was passed in', () => {
  it('shows both states', () => {
    show(false, true)

    expect(screen.getByLabelText<HTMLInputElement>(RESTORE).checked).toBe(false)
    expect(screen.getByLabelText<HTMLInputElement>(COMMANDS).checked).toBe(true)
  })

  /** Running startup commands is meaningless if nothing is being restored. */
  it('disables the command toggle while restore is off', () => {
    show(false, false)

    expect(screen.getByLabelText<HTMLInputElement>(COMMANDS).disabled).toBe(true)
  })

  it('enables it once restore is on', () => {
    show(true, false)

    expect(screen.getByLabelText<HTMLInputElement>(COMMANDS).disabled).toBe(false)
  })
})

describe('intents', () => {
  it('reports a change to restore', () => {
    show(true)

    fireEvent.click(screen.getByLabelText(RESTORE))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ restoreLastWorkspace: false })
  })

  it('reports a change to the command opt-in', () => {
    show(true, false)

    fireEvent.click(screen.getByLabelText(COMMANDS))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ runStartupCommandsOnRestore: true })
  })

  it('says why the opt-in is off by default', () => {
    show()

    expect(screen.getByText(/would otherwise run just because GitDeck started/)).toBeDefined()
  })
})

/** The panel above it owns every IPC call. */
describe('boundary', () => {
  it('drives the whole component without touching the bridge', () => {
    show()

    fireEvent.click(screen.getByLabelText(RESTORE))
    fireEvent.click(screen.getByLabelText(COMMANDS))

    expect(api.calls).toEqual(emptyCalls())
  })
})
