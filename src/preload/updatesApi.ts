import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Unsubscribe } from '@shared/contracts/events'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type { UpdateCheckResult } from '@shared/contracts/updates'
import type { Result } from '@shared/domain/result'
import type { UpdatesApi } from './api'

const invoke = <T>(channel: string, payload: unknown): Promise<Result<T, IpcError>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<T, IpcError>>

/**
 * The updates bridge: a manual check, opening the release page Main minted,
 * and the startup notification. `openRelease` sends no payload at all — there
 * is deliberately nothing here through which a URL could travel.
 */
export const updatesApi: UpdatesApi = {
  check: () => invoke<UpdateCheckResult>(IPC.updates.check, undefined),

  openRelease: () => invoke<null>(IPC.updates.release, undefined),

  onAvailable: (callback: (result: UpdateCheckResult) => void): Unsubscribe => {
    const listener = (_event: IpcRendererEvent, payload: UpdateCheckResult): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC.updates.available, listener)
    return () => {
      ipcRenderer.off(IPC.updates.available, listener)
    }
  }
}
