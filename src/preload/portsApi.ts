import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Unsubscribe } from '@shared/contracts/events'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type {
  PortSnapshot,
  TerminatePortProcessesRequest,
  TerminatePortProcessesResult
} from '@shared/contracts/ports'
import type { Result } from '@shared/domain/result'
import type { PortsApi } from './api'

const invoke = <T>(channel: string, payload: unknown): Promise<Result<T, IpcError>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<T, IpcError>>

/**
 * The ports bridge: list, terminate, and the menu's open signal. `terminate`
 * forwards the request object as-is — Main validates it strictly, and there is
 * deliberately nothing here through which a PID or a command could travel.
 */
export const portsApi: PortsApi = {
  list: () => invoke<PortSnapshot>(IPC.ports.list, undefined),

  terminate: (request: TerminatePortProcessesRequest) =>
    invoke<TerminatePortProcessesResult>(IPC.ports.terminate, request),

  onOpen: (callback: () => void): Unsubscribe => {
    // The event carries no payload; the callback signature says so.
    const listener = (_event: IpcRendererEvent): void => {
      callback()
    }
    ipcRenderer.on(IPC.ports.open, listener)
    return () => {
      ipcRenderer.off(IPC.ports.open, listener)
    }
  }
}
