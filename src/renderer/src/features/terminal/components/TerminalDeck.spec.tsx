import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { useSettingsStore } from '../../settings/public'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { triggerResize } from '../../../testing/setup'
import { useTerminalStore } from '../store/terminalStore'
import { TerminalDeck } from './TerminalDeck'

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate(): void {}
    dispose(): void {}
    proposeDimensions(): { cols: number; rows: number } {
      return { cols: 80, rows: 24 }
    }
  }
}))

let api: FakeGitDeckApi
let created = 0
let openSpy: ReturnType<typeof vi.spyOn>

const session = (id: string): TerminalSessionInfo => ({
  id,
  definition: { id: `term_${id}`, title: id, cwd: 'C:/work', shellProfileId: 'powershell' },
  status: 'running',
  createdAt: 0
})

const bufferOf = (index: number): string => {
  const terminal = openSpy.mock.instances[index] as Terminal
  return terminal.buffer.active.getLine(0)?.translateToString(true) ?? ''
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

beforeEach(() => {
  created = 0
  api = createFakeGitDeckApi()
  api.terminal.create = (request) => {
    api.calls.create.push(request)
    created += 1
    return Promise.resolve({ ok: true, value: session(`sess_${created}`) })
  }
  api.install()
  useSettingsStore.getState().reset()
  useTerminalStore.getState().reset()
  openSpy = vi.spyOn(Terminal.prototype, 'open')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  api.uninstall()
})

/** Opens extra sessions on an already-rendered deck. */
const openMoreSessions = async (count: number): Promise<void> => {
  const navigator = screen.getByRole('complementary', { name: 'Terminal Navigator' })
  const already = useTerminalStore.getState().order.length
  for (let index = 0; index < count; index += 1) {
    fireEvent.click(within(navigator).getByRole('button', { name: 'New terminal' }))
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(already + index + 1))
  }
}

const openSessions = async (count: number): Promise<void> => {
  render(<TerminalDeck />)
  await openMoreSessions(count)
}

describe('Mosaic lifecycle', () => {
  it('renders no horizontal tablist and opens nothing on mount', async () => {
    render(<TerminalDeck />)
    await flush()

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('main', { name: 'Terminal mosaic' })).toBeDefined()
    expect(api.calls.create).toEqual([])
  })

  it('keeps every session on the one-page Grid — a fifth evicts nothing (Phase 21)', async () => {
    await openSessions(5)

    expect(openSpy.mock.instances).toHaveLength(5)
    expect(screen.getByTestId('panel-sess_4').hasAttribute('hidden')).toBe(false)
    expect(screen.getByTestId('panel-sess_5').hasAttribute('hidden')).toBe(false)
    expect(useTerminalStore.getState().visibleSessionIds).toEqual([
      'sess_1',
      'sess_2',
      'sess_3',
      'sess_4',
      'sess_5'
    ])
  })

  it('retains output received while a terminal is parked', async () => {
    await openSessions(5)
    fireEvent.click(screen.getByRole('button', { name: 'Park sess_4' }))
    expect(screen.getByTestId('panel-sess_4').hasAttribute('hidden')).toBe(true)
    act(() => api.emitData({ sessionId: 'sess_4', data: 'while-parked' }))
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'sess_4' }))
    await flush()

    expect(screen.getByTestId('panel-sess_4').hasAttribute('hidden')).toBe(false)
    expect(bufferOf(3)).toContain('while-parked')
    expect(api.calls.kill).toEqual([])
  })

  it('balances the Grid lattice from the measured canvas (Phase 21)', async () => {
    await openSessions(3)
    const canvas = document.querySelector<HTMLElement>('.terminal-mosaic__canvas')
    if (!canvas) throw new Error('canvas not rendered')

    // Three sessions + the add slot = four tiles: the classic 2×2 stands.
    expect(canvas.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
    expect(canvas.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))')

    // Five sessions + the add slot = six tiles; jsdom measures 0×0, so the
    // square-ish fallback lattice applies.
    await openMoreSessions(2)
    expect(canvas.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
    expect(canvas.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))')

    // A measured portrait canvas re-balances the same six tiles into strips.
    canvas.getBoundingClientRect = () =>
      ({ width: 900, height: 1600, top: 0, left: 0, right: 900, bottom: 1600 }) as DOMRect
    act(() => triggerResize())
    expect(canvas.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')
    expect(canvas.style.gridTemplateRows).toBe('repeat(6, minmax(0, 1fr))')
  })

  it('switches presets without creating, killing, or remounting sessions', async () => {
    await openSessions(4)
    const mountedBefore = openSpy.mock.instances.length
    const createdBefore = api.calls.create.length

    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))

    expect(openSpy.mock.instances).toHaveLength(mountedBefore)
    expect(api.calls.create).toHaveLength(createdBefore)
    expect(api.calls.kill).toEqual([])
  })

  it('the pane focus button toggles: maximize, then restore the mode it came from', async () => {
    await openSessions(2)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))

    fireEvent.click(screen.getByRole('button', { name: 'Focus sess_1' }))

    expect(useTerminalStore.getState().layoutMode).toBe('focus')
    expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
    // The same button is now the restore control, on the one visible pane.
    expect(screen.queryByRole('button', { name: 'Focus sess_1' })).toBeNull()
    const restore = screen.getByRole('button', { name: 'Restore sess_1' })
    expect(restore.textContent).toBe('↙')
    expect(restore.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(restore)

    expect(useTerminalStore.getState().layoutMode).toBe('columns')
    expect(screen.getByRole('button', { name: 'Focus sess_1' }).textContent).toBe('↗')
    expect(api.calls.kill).toEqual([])
  })

  it('flips the pane icon when Focus is entered from the toolbar too', async () => {
    await openSessions(2)

    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))

    expect(screen.getByRole('button', { name: 'Restore sess_2' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Restore sess_2' }))

    expect(useTerminalStore.getState().layoutMode).toBe('grid')
  })

  it('parks a pane without closing its process', async () => {
    await openSessions(2)

    fireEvent.click(screen.getByRole('button', { name: 'Park sess_2' }))

    expect(useTerminalStore.getState().order).toEqual(['sess_1', 'sess_2'])
    expect(useTerminalStore.getState().visibleSessionIds).toEqual(['sess_1'])
    expect(api.calls.kill).toEqual([])
  })
})

describe('the add-terminal slot (Phase 20)', () => {
  const addButtons = (): HTMLElement[] => screen.queryAllByRole('button', { name: /Add new Terminal/ })

  it('always offers exactly one slot in Grid, at any count (Phase 21)', async () => {
    await openSessions(1)
    expect(addButtons()).toHaveLength(1)

    await openMoreSessions(3)
    expect(addButtons()).toHaveLength(1)

    await openMoreSessions(1)
    expect(addButtons()).toHaveLength(1)
  })

  it('shows one slot in Columns and Main + Side while below their capacity', async () => {
    await openSessions(1)

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    expect(addButtons()).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Main + Side' }))
    expect(addButtons()).toHaveLength(1)

    await openMoreSessions(1)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    expect(addButtons()).toHaveLength(0)
  })

  it('never shows in Focus', async () => {
    await openSessions(1)

    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))

    expect(addButtons()).toHaveLength(0)
  })

  it('stays out of the zero-terminal and all-parked states', async () => {
    render(<TerminalDeck />)
    await flush()
    expect(addButtons()).toHaveLength(0)

    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Terminal Navigator' })).getByRole(
        'button',
        { name: 'New terminal' }
      )
    )
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Park sess_1' }))

    expect(useTerminalStore.getState().visibleSessionIds).toEqual([])
    expect(addButtons()).toHaveLength(0)
  })

  it('creates a fresh default terminal — nothing inherited from existing panes', async () => {
    await openSessions(1)
    const before = api.calls.create.length

    fireEvent.click(screen.getByRole('button', { name: /Add new Terminal/ }))
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(2))

    // An empty request: default shell, default directory — not a duplicate.
    expect(api.calls.create[before]).toEqual({})
    expect(useTerminalStore.getState().visibleSessionIds).toContain('sess_2')
  })

  it('disables while a create is in flight, so a double-click cannot double-spawn', async () => {
    await openSessions(1)
    let release: (() => void) | null = null
    const original = api.terminal.create
    api.terminal.create = (request) =>
      new Promise((resolve) => {
        release = () => {
          void original(request).then(resolve)
        }
      })

    const button = screen.getByRole('button', { name: /Add new Terminal/ })
    fireEvent.click(button)

    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true))
    act(() => release?.())
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(2))
  })
})

describe('session actions', () => {
  it('closes one running terminal and leaves the others alive', async () => {
    await openSessions(3)

    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Terminal Navigator' })).getByRole(
        'button',
        { name: 'Close sess_2' }
      )
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
    await waitFor(() => expect(useTerminalStore.getState().order).toEqual(['sess_1', 'sess_3']))

    expect(api.calls.kill).toEqual(['sess_2'])
    expect(screen.getByTestId('panel-sess_1')).toBeDefined()
    expect(screen.getByTestId('panel-sess_3')).toBeDefined()
  })

  it('marks an exited terminal in the Navigator without removing it', async () => {
    await openSessions(1)
    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 130 }))

    expect(screen.getByRole('button', { name: 'sess_1 (exited)' })).toBeDefined()
    expect(screen.getByTestId('panel-sess_1')).toBeDefined()
  })
})

describe('shortcuts', () => {
  const press = (init: KeyboardEventInit): void => {
    fireEvent.keyDown(window, { bubbles: true, cancelable: true, ...init })
  }

  it('Ctrl+T creates and Ctrl+Tab focuses without killing', async () => {
    await openSessions(2)

    press({ key: 't', ctrlKey: true })
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(3))
    press({ key: 'Tab', ctrlKey: true })

    expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
    expect(api.calls.kill).toEqual([])
  })

  it('Ctrl+W closes the focused terminal through confirmation', async () => {
    await openSessions(2)

    press({ key: 'w', ctrlKey: true })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
    await waitFor(() => expect(useTerminalStore.getState().order).toEqual(['sess_1']))

    expect(api.calls.kill).toEqual(['sess_2'])
  })
})
