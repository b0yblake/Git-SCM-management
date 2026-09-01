import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'

interface FakeWindow {
  destroyed: boolean
  webContentsDestroyed: boolean
  sent: Array<{ channel: string; payload: unknown }>
}

const windows: FakeWindow[] = []

const makeWindow = (overrides: Partial<FakeWindow> = {}): FakeWindow => {
  const window: FakeWindow = {
    destroyed: false,
    webContentsDestroyed: false,
    sent: [],
    ...overrides
  }
  windows.push(window)
  return window
}

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {
    getAllWindows: () =>
      windows.map((window) => ({
        isDestroyed: () => window.destroyed,
        webContents: {
          isDestroyed: () => window.webContentsDestroyed,
          send: (channel: string, payload: unknown) => {
            // Electron really does throw here; the port exists to avoid it.
            if (window.destroyed || window.webContentsDestroyed) {
              throw new Error('Object has been destroyed')
            }
            window.sent.push({ channel, payload })
          }
        }
      }))
  }
}))

const { electronBroadcaster } = await import('./ipcPorts')

beforeEach(() => {
  windows.length = 0
})

describe('electronBroadcaster', () => {
  it('sends to every live window', () => {
    const a = makeWindow()
    const b = makeWindow()

    electronBroadcaster.send(IPC.terminal.data, { sessionId: 'sess_1', data: 'x' })

    expect(a.sent).toHaveLength(1)
    expect(b.sent).toEqual([
      { channel: IPC.terminal.data, payload: { sessionId: 'sess_1', data: 'x' } }
    ])
  })

  it('skips a destroyed window instead of throwing', () => {
    makeWindow({ destroyed: true })
    const live = makeWindow()

    expect(() => electronBroadcaster.send(IPC.terminal.exit, { sessionId: 'x' })).not.toThrow()
    expect(live.sent).toHaveLength(1)
  })

  it('skips a window whose webContents is destroyed', () => {
    makeWindow({ webContentsDestroyed: true })

    expect(() => electronBroadcaster.send(IPC.terminal.data, {})).not.toThrow()
  })

  it('is a no-op when no window is open', () => {
    expect(() => electronBroadcaster.send(IPC.terminal.data, {})).not.toThrow()
  })
})
