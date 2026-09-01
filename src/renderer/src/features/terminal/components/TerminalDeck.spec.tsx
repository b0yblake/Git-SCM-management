import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { useSettingsStore } from '../../settings/public'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
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

const openSessions = async (count: number): Promise<void> => {
  render(<TerminalDeck />)
  const navigator = screen.getByRole('complementary', { name: 'Terminal Navigator' })

  for (let index = 0; index < count; index += 1) {
    fireEvent.click(within(navigator).getByRole('button', { name: 'New terminal' }))
    await waitFor(() => expect(useTerminalStore.getState().order).toHaveLength(index + 1))
  }
}

describe('Mosaic lifecycle', () => {
  it('renders no horizontal tablist and opens nothing on mount', async () => {
    render(<TerminalDeck />)
    await flush()

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('main', { name: 'Terminal mosaic' })).toBeDefined()
    expect(api.calls.create).toEqual([])
  })

  it('keeps every xterm mounted while Grid shows at most four', async () => {
    await openSessions(5)

    expect(openSpy.mock.instances).toHaveLength(5)
    expect(screen.getByTestId('panel-sess_4').hasAttribute('hidden')).toBe(true)
    expect(screen.getByTestId('panel-sess_5').hasAttribute('hidden')).toBe(false)
    expect(useTerminalStore.getState().visibleSessionIds).toEqual([
      'sess_1',
      'sess_2',
      'sess_3',
      'sess_5'
    ])
  })

  it('retains output received while a terminal is parked', async () => {
    await openSessions(5)
    act(() => api.emitData({ sessionId: 'sess_4', data: 'while-parked' }))
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'sess_4' }))
    await flush()

    expect(screen.getByTestId('panel-sess_4').hasAttribute('hidden')).toBe(false)
    expect(bufferOf(3)).toContain('while-parked')
    expect(api.calls.kill).toEqual([])
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

  it('parks a pane without closing its process', async () => {
    await openSessions(2)

    fireEvent.click(screen.getByRole('button', { name: 'Park sess_2' }))

    expect(useTerminalStore.getState().order).toEqual(['sess_1', 'sess_2'])
    expect(useTerminalStore.getState().visibleSessionIds).toEqual(['sess_1'])
    expect(api.calls.kill).toEqual([])
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
