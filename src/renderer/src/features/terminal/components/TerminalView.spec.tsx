import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../../settings/public'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { observersWatching, triggerResize } from '../../../testing/setup'
import { TerminalView } from './TerminalView'

/**
 * FitAddon measures a real layout; jsdom has none. Only the measurement is
 * faked — the xterm instance under test is real, so writing, buffer contents
 * and disposal are genuinely exercised.
 */
const XTERM_DEFAULT = { cols: 80, rows: 24 }

// Deliberately different from xterm's own default: a real window never happens
// to be exactly 80x24, and the PTY is spawned at the default until we fit.
const proposed = vi.hoisted(() => ({
  value: { cols: 100, rows: 30 } as { cols: number; rows: number } | undefined
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate(): void {}
    dispose(): void {}
    proposeDimensions(): { cols: number; rows: number } | undefined {
      return proposed.value
    }
  }
}))

let api: FakeGitDeckApi

beforeEach(() => {
  proposed.value = { cols: 100, rows: 30 }
  api = createFakeGitDeckApi()
  api.install()
  useSettingsStore.getState().reset()
})

afterEach(() => {
  // Unmount while the bridge is still installed: a component whose effects
  // flush after uninstall would read an undefined window.gitdeck.
  cleanup()
  api.uninstall()
})

/** Fitting is deferred to an animation frame; let it run. */
const frame = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

/** xterm parses writes asynchronously; flush before reading the buffer. */
const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

/**
 * jsdom has no layout, so xterm never paints rows into the DOM — its container
 * only ever holds the character-measurement element. The buffer is the real
 * evidence that output landed, so tests read it off the live instance.
 */
const renderView = (sessionId = 'sess_1') => {
  const open = vi.spyOn(Terminal.prototype, 'open')
  const view = render(<TerminalView sessionId={sessionId} />)
  const terminal = open.mock.instances.at(-1) as Terminal
  open.mockRestore()
  return { ...view, terminal }
}

const firstLine = (terminal: Terminal): string =>
  terminal.buffer.active.getLine(0)?.translateToString(true) ?? ''

describe('wiring', () => {
  it('subscribes once to data and once to exit', () => {
    render(<TerminalView sessionId="sess_1" />)

    expect(api.listenerCount()).toBe(2)
  })

  it('renders PTY output into the xterm buffer', async () => {
    const { terminal } = renderView()

    act(() => api.emitData({ sessionId: 'sess_1', data: 'gitdeck-rendered' }))
    await flush()

    expect(firstLine(terminal)).toContain('gitdeck-rendered')
  })

  it('forwards a keystroke to the session', () => {
    const { terminal } = renderView()

    act(() => terminal.input('a'))

    expect(api.calls.write).toEqual([{ sessionId: 'sess_1', data: 'a' }])
  })

  it('sends the fitted dimensions on mount', async () => {
    render(<TerminalView sessionId="sess_1" />)
    await frame()

    expect(api.calls.resize).toEqual([{ sessionId: 'sess_1', cols: 100, rows: 30 }])
  })

  it('sends a resize when the observer reports new dimensions', async () => {
    render(<TerminalView sessionId="sess_1" />)
    await frame()

    proposed.value = { cols: 120, rows: 40 }
    act(() => triggerResize())
    await frame()

    expect(api.calls.resize.at(-1)).toEqual({ sessionId: 'sess_1', cols: 120, rows: 40 })
  })

  it('coalesces a burst of observer callbacks into one measurement', async () => {
    render(<TerminalView sessionId="sess_1" />)
    await frame()
    const before = api.calls.resize.length

    proposed.value = { cols: 120, rows: 40 }
    act(() => {
      triggerResize()
      triggerResize()
      triggerResize()
    })
    await frame()

    expect(api.calls.resize).toHaveLength(before + 1)
  })

  it('sends nothing when the proposal matches what xterm already has', async () => {
    proposed.value = XTERM_DEFAULT
    render(<TerminalView sessionId="sess_1" />)
    await frame()

    act(() => triggerResize())
    await frame()

    expect(api.calls.resize).toEqual([])
  })

  it('never sends an unusable dimension', async () => {
    render(<TerminalView sessionId="sess_1" />)
    await frame()
    const beforeCount = api.calls.resize.length

    proposed.value = { cols: 0, rows: Number.NaN }
    act(() => triggerResize())
    await frame()
    proposed.value = undefined
    act(() => triggerResize())
    await frame()

    expect(api.calls.resize).toHaveLength(beforeCount)
  })
})

/**
 * Regression: the surface was a flex item, so resizing xterm changed the very
 * box FitAddon measures. The observer fired, the proposal flipped, and the
 * terminal oscillated between 40 and 41 rows at ~60Hz — 446 resizes in eight
 * seconds in the real app, which is what the flicker was.
 *
 * The fix that breaks the loop is CSS (the surface is now absolutely
 * positioned, so its size no longer depends on its content). These assert the
 * code-level guards that keep a stray oscillation cheap.
 */
describe('resize feedback', () => {
  it('an oscillating proposal cannot produce an unbounded number of resizes', async () => {
    render(<TerminalView sessionId="sess_1" />)
    await frame()
    const before = api.calls.resize.length

    // Alternate the proposal the way the broken layout did.
    for (let i = 0; i < 20; i++) {
      proposed.value = { cols: 162, rows: i % 2 === 0 ? 40 : 41 }
      act(() => triggerResize())
    }
    await frame()

    // Everything inside one frame collapses to a single measurement.
    expect(api.calls.resize.length - before).toBe(1)
  })

  it('settles instead of ping-ponging once the proposal stops changing', async () => {
    render(<TerminalView sessionId="sess_1" />)
    await frame()

    proposed.value = { cols: 100, rows: 30 }
    act(() => triggerResize())
    await frame()
    const afterFirst = api.calls.resize.length

    for (let i = 0; i < 5; i++) {
      act(() => triggerResize())
      await frame()
    }

    expect(api.calls.resize).toHaveLength(afterFirst)
  })
})

describe('lifecycle', () => {
  it('unmount unsubscribes both listeners', () => {
    const { unmount } = render(<TerminalView sessionId="sess_1" />)

    unmount()

    expect(api.listenerCount()).toBe(0)
  })

  it('unmount disconnects the ResizeObserver', async () => {
    const { unmount } = render(<TerminalView sessionId="sess_1" />)
    await frame()
    const before = api.calls.resize.length

    unmount()
    proposed.value = { cols: 200, rows: 50 }
    act(() => triggerResize())
    await frame()

    // A leaked observer would still be firing syncSize into a dead session.
    expect(api.calls.resize).toHaveLength(before)
  })

  /** The rule the whole phase exists to protect. */
  it('unmount does NOT kill the PTY', () => {
    const { unmount } = render(<TerminalView sessionId="sess_1" />)

    unmount()

    expect(api.calls.kill).toEqual([])
  })

  it('late PTY output after unmount is dropped rather than written to a disposed xterm', () => {
    const { unmount } = render(<TerminalView sessionId="sess_1" />)

    unmount()

    expect(() => api.emitData({ sessionId: 'sess_1', data: 'late' })).not.toThrow()
  })

  it('remounting the same session re-subscribes cleanly and still renders', async () => {
    renderView().unmount()

    const { terminal } = renderView()
    act(() => api.emitData({ sessionId: 'sess_1', data: 'second-mount' }))
    await flush()

    expect(api.listenerCount()).toBe(2)
    expect(firstLine(terminal)).toContain('second-mount')
  })

  // Fifty real xterm instances take seconds under jsdom, and a test that only
  // fails when the machine is busy is worse than a slow one.
  it('50 mount/unmount cycles leave no subscriptions and no observers', () => {
    for (let i = 0; i < 50; i++) {
      render(<TerminalView sessionId="sess_1" />).unmount()
    }

    expect(api.listenerCount()).toBe(0)
    expect(observersWatching(document.body)).toBe(0)
  }, 20_000)
})

describe('exited state', () => {
  it('renders the exit notice with the code', () => {
    render(<TerminalView sessionId="sess_1" />)

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 130 }))

    expect(screen.getByRole('status').textContent).toContain('130')
  })

  it('shows no notice while the session is running', () => {
    render(<TerminalView sessionId="sess_1" />)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stops forwarding input once the session has exited', () => {
    render(<TerminalView sessionId="sess_1" />)

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 0 }))
    act(() => api.emitData({ sessionId: 'sess_1', data: 'still renders' }))

    expect(api.calls.write).toEqual([])
  })
})

/**
 * Two bugs reported 2026-09-04, both in the right-click menu.
 *
 * The menu focuses its first command when it opens, and unmounting it after a
 * command dropped focus on the document body: a paste landed, and the Enter
 * after it went nowhere until the user clicked the terminal again. And getting
 * a line of earlier output back onto the prompt took Copy, then Paste — two
 * trips through the menu for one line.
 */
describe('context menu', () => {
  const clipboard = { readText: vi.fn(), writeText: vi.fn() }

  beforeEach(() => {
    clipboard.readText.mockReset().mockResolvedValue('from-clipboard')
    clipboard.writeText.mockReset().mockResolvedValue(undefined)
    // jsdom has no clipboard; the view only ever touches these two members.
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  })

  const openMenu = (): void => {
    fireEvent.contextMenu(screen.getByTestId('terminal-surface'))
    // The precondition the focus bug depends on: the menu now owns the keyboard.
    expect(document.activeElement?.textContent).toBe('Copy')
  }

  it('Paste writes the clipboard to the shell and hands the keyboard back', async () => {
    const { terminal } = renderView()
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }))
    await flush()

    expect(api.calls.write).toEqual([{ sessionId: 'sess_1', data: 'from-clipboard' }])
    expect(document.activeElement).toBe(terminal.textarea)
  })

  it('Copy hands the keyboard back too', async () => {
    const { terminal } = renderView()
    act(() => api.emitData({ sessionId: 'sess_1', data: 'echo hello' }))
    await flush()
    act(() => terminal.select(0, 0, 10))
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }))

    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith('echo hello')
    expect(document.activeElement).toBe(terminal.textarea)
  })

  it('Paste selection sends the highlighted text as typed input, without Enter', async () => {
    const { terminal } = renderView()
    act(() => api.emitData({ sessionId: 'sess_1', data: 'echo hello' }))
    await flush()
    act(() => terminal.select(0, 0, 10))
    expect(terminal.getSelection()).toBe('echo hello')
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste selection' }))

    expect(api.calls.write).toEqual([{ sessionId: 'sess_1', data: 'echo hello' }])
    // Nothing touched the clipboard: Copy stays a separate, deliberate act.
    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(clipboard.readText).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(terminal.textarea)
  })

  it('Paste selection is disabled when nothing is highlighted', () => {
    renderView()
    openMenu()

    expect(screen.getByRole('menuitem', { name: 'Paste selection' })).toHaveProperty(
      'disabled',
      true
    )
  })
})
