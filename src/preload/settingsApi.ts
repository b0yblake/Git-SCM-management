import { ipcRenderer } from 'electron'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type { AppSettings, AppSettingsPatch } from '@shared/contracts/settings'
import type { Result } from '@shared/domain/result'
import type { SettingsApi } from './api'

const invoke = (channel: string, payload: unknown): Promise<Result<AppSettings, IpcError>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<AppSettings, IpcError>>

export const settingsApi: SettingsApi = {
  get: () => invoke(IPC.settings.get, undefined),
  update: (patch: AppSettingsPatch) => invoke(IPC.settings.update, patch)
}
