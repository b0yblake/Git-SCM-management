import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeGitDeckApi,
  emptyCalls,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { TerminalContextMenu, TERMINAL_MENU_COMMANDS } from './TerminalContextMenu'

let api: FakeGitDeckApi
const onCommand = vi.fn()
const onDismiss = vi.fn()

const show = (props: { hasSelection?: boolean } = {}) =>
  render(
    <TerminalContextMenu x={40} y={60} {...props} onCommand={onCommand} onDismiss={onDismiss} />
  )

const labels = (): string[] =>
  screen.getAllByRole('menuitem').map((button) => button.textContent ?? '')

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  onCommand.mockClear()
  onDismiss.mockClear()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('the command list', () => {
  it('renders exactly the seven allowed commands, in order', () => {
    show()

    expect(labels()).toEqual([
      'Copy',
      'Paste',
      'Paste selection',
      'Clear',
      'Rename terminal',
      'Duplicate terminal',
      'Close terminal'
    ])
  })

  /**
   * The assertion that matters: an eighth command would have to be added to
   * `TERMINAL_MENU_COMMANDS`, and this pins that list to Phase 10's six plus
   * the one deliberate addition (Paste selection, 2026-09-04).
   */
  it('has no eighth command', () => {
    show()

    expect(labels()).toHaveLength(7)
    expect(TERMINAL_MENU_COMMANDS).toHaveLength(7)
  })

  it('reports each command by name', () => {
    show({ hasSelection: true })

    for (const command of TERMINAL_MENU_COMMANDS) {
      onCommand.mockClear()
      fireEvent.click(screen.getByRole('menuitem', { name: command }))
      expect(onCommand).toHaveBeenCalledExactlyOnceWith(command)
    }
  })
})

describe('Paste selection', () => {
  it('is disabled until the terminal has something highlighted', () => {
    show()
    expect(screen.getByRole('menuitem', { name: 'Paste selection' })).toHaveProperty(
      'disabled',
      true
    )

    cleanup()

    show({ hasSelection: true })
    expect(screen.getByRole('menuitem', { name: 'Paste selection' })).toHaveProperty(
      'disabled',
      false
    )
  })

  it('reports nothing while disabled', () => {
    show()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste selection' }))

    expect(onCommand).not.toHaveBeenCalled()
  })
})

describe('dismissing', () => {
  it('closes when the backdrop is pressed', () => {
    const { container } = show()

    fireEvent.mouseDown(container.querySelector('.context-menu-backdrop')!)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, so it is escapable without a mouse', () => {
    show()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('a press inside the menu does not dismiss it', () => {
    show()

    fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Copy' }))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('stops listening for Escape once unmounted', () => {
    show().unmount()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onDismiss).not.toHaveBeenCalled()
  })
})

describe('keyboard', () => {
  it('focus lands on the first command when it opens', () => {
    show()

    expect(document.activeElement?.textContent).toBe('Copy')
  })

  it('names itself for a screen reader', () => {
    show()

    expect(screen.getByRole('menu', { name: 'Terminal actions' })).toBeDefined()
  })
})

/** None of the seven reaches IPC directly, and none adds a channel. */
describe('boundary', () => {
  it('drives every command without touching the bridge', () => {
    show({ hasSelection: true })

    for (const command of TERMINAL_MENU_COMMANDS) {
      fireEvent.click(screen.getByRole('menuitem', { name: command }))
    }

    expect(api.calls).toEqual(emptyCalls())
  })
})
