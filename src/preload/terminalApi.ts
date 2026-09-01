import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Unsubscribe } from '@shared/contracts/events'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type {
  AvailableShellProfile,
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSessionInfo
} from '@shared/contracts/terminal'
import type { Result } from '@shared/domain/result'
import type { TerminalApi } from './api'

/**
 * The `Result` from Main is forwarded to the renderer as-is: it is plain data,
 * so contextBridge clones it without losing the error `code`. See the note on
 * `TerminalApi` for why this is not a rejecting promise.
 */
const invoke = <T>(channel: string, payload: unknown): Promise<Result<T, IpcError>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<T, IpcError>>

const subscribe = <T>(channel: string, callback: (event: T) => void): Unsubscribe => {
  const listener = (_event: IpcRendererEvent, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

export const terminalApi: TerminalApi = {
  create: (request: TerminalCreateRequest) =>
    invoke<TerminalSessionInfo>(IPC.terminal.create, request),

  profiles: () => invoke<readonly AvailableShellProfile[]>(IPC.terminal.profiles, undefined),

  write: (sessionId: string, data: string) => {
    ipcRenderer.send(IPC.terminal.write, { sessionId, data })
  },

  resize: (sessionId: string, cols: number, rows: number) => {
    ipcRenderer.send(IPC.terminal.resize, { sessionId, cols, rows })
  },

  kill: (sessionId: string) => invoke<null>(IPC.terminal.kill, { sessionId }),

  onData: (callback: (event: TerminalDataEvent) => void) => subscribe(IPC.terminal.data, callback),

  onExit: (callback: (event: TerminalExitEvent) => void) => subscribe(IPC.terminal.exit, callback)
}
