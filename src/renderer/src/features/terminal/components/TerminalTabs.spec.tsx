import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { useSettingsStore } from '../../settings/public'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../store/terminalStore'
import { TerminalTabs } from './TerminalTabs'

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

/** Reads the buffer of the xterm belonging to the nth mounted view. */
const bufferOf = (index: number): string => {
  const terminal = openSpy.mock.instances[index] as Terminal
  return terminal.buffer.active.getLine(0)?.translateToString(true) ?? ''
}

/** Phase 10 replaced window.confirm with a dialog; closing means answering it. */
const answerCloseDialog = async (): Promise<void> => {
  await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
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

const openTabs = async (count: number): Promise<void> => {
  render(<TerminalTabs />)

  for (let i = 0; i < count; i++) {
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(i + 1))
  }
}

describe('layout', () => {
  it('renders a panel per session', async () => {
    await openTabs(1)

    expect(api.calls.create).toHaveLength(1)
    expect(screen.getByTestId('panel-sess_1')).toBeDefined()
  })

  /**
   * Startup moved to `useRestoreOnStartup` in Phase 8: the window may be
   * showing a restored workspace, and opening a terminal here as well would
   * race it and leave a stray tab beside the restored ones. Asserting the
   * absence is what stops the old behaviour creeping back.
   */
  it('opens nothing on mount — startup is not its decision', async () => {
    render(<TerminalTabs />)
    await flush()
    await flush()

    expect(api.calls.create).toEqual([])
    expect(useTerminalStore.getState().order).toEqual([])
  })

  it('keeps every panel mounted and hides the inactive ones', async () => {
    await openTabs(3)

    expect(screen.getByTestId('panel-sess_1').hasAttribute('hidden')).toBe(true)
    expect(screen.getByTestId('panel-sess_2').hasAttribute('hidden')).toBe(true)
    expect(screen.getByTestId('panel-sess_3').hasAttribute('hidden')).toBe(false)
  })
})

describe('session retention — the point of this phase', () => {
  it('output arriving while a tab is hidden is still there when it is shown', async () => {
    await openTabs(2)

    // sess_2 is active; sess_1 is hidden but must keep receiving.
    act(() => api.emitData({ sessionId: 'sess_1', data: 'while-hidden' }))
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'sess_1' }))
    await flush()

    expect(bufferOf(0)).toContain('while-hidden')
  })

  it('each session only ever receives its own output', async () => {
    await openTabs(2)

    act(() => {
      api.emitData({ sessionId: 'sess_1', data: 'first' })
      api.emitData({ sessionId: 'sess_2', data: 'second' })
    })
    await flush()

    expect(bufferOf(0)).toContain('first')
    expect(bufferOf(0)).not.toContain('second')
    expect(bufferOf(1)).toContain('second')
  })

  it('switching away and back does not kill or re-create anything', async () => {
    await openTabs(2)
    const mountedBefore = openSpy.mock.instances.length

    fireEvent.click(screen.getByRole('button', { name: 'sess_1' }))
    fireEvent.click(screen.getByRole('button', { name: 'sess_2' }))

    expect(api.calls.kill).toEqual([])
    expect(api.calls.create).toHaveLength(2)
    expect(openSpy.mock.instances).toHaveLength(mountedBefore)
  })

  it('closing one tab leaves the others running', async () => {
    await openTabs(3)

    fireEvent.click(screen.getByRole('button', { name: 'Close sess_2' }))
    await answerCloseDialog()
    await waitFor(() => expect(useTerminalStore.getState().order).toEqual(['sess_1', 'sess_3']))

    expect(api.calls.kill).toEqual(['sess_2'])
    expect(screen.getByTestId('panel-sess_1')).toBeDefined()
    expect(screen.getByTestId('panel-sess_3')).toBeDefined()
  })
})

describe('exited tabs', () => {
  it('an exiting session marks its tab without closing it', async () => {
    await openTabs(1)

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 130 }))

    expect(screen.getByRole('button', { name: 'sess_1 (exited)' }).textContent).toContain('exited')
    expect(screen.getByTestId('panel-sess_1')).toBeDefined()
  })
})

describe('shortcuts wired to the layout', () => {
  const press = (init: KeyboardEventInit): void => {
    fireEvent.keyDown(window, { bubbles: true, cancelable: true, ...init })
  }

  it('Ctrl+T opens another terminal', async () => {
    await openTabs(1)

    press({ key: 't', ctrlKey: true })
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(2))

    expect(api.calls.create).toHaveLength(2)
  })

  it('Ctrl+Tab switches without killing', async () => {
    await openTabs(2)

    press({ key: 'Tab', ctrlKey: true })

    expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
    expect(api.calls.kill).toEqual([])
  })

  it('Ctrl+W closes the active terminal', async () => {
    await openTabs(2)

    press({ key: 'w', ctrlKey: true })
    await answerCloseDialog()
    await waitFor(() => expect(useTerminalStore.getState().order).toEqual(['sess_1']))

    expect(api.calls.kill).toEqual(['sess_2'])
  })
})
