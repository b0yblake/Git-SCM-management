import { ipcRenderer } from 'electron'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type { DataFolderInfo } from '@shared/contracts/storage'
import type { Result } from '@shared/domain/result'
import type { StorageApi } from './api'

const invoke = <T>(channel: string, payload: unknown): Promise<Result<T, IpcError>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<T, IpcError>>

/**
 * The data-folder bridge: read where data lives, and ask Main to show the
 * native folder picker. Both members send no payload at all — a filesystem
 * path can never travel renderer → Main.
 */
export const storageApi: StorageApi = {
  dataFolder: () => invoke<DataFolderInfo>(IPC.storage.info, undefined),

  chooseDataFolder: () => invoke<DataFolderInfo | null>(IPC.storage.choose, undefined)
}
