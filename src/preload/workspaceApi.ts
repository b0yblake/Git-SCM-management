import { ipcRenderer } from 'electron'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type { Workspace, WorkspaceInput, WorkspaceSummary } from '@shared/contracts/workspace'
import type { Result } from '@shared/domain/result'
import type { WorkspaceApi } from './api'

/** The `Result` from Main is plain data, so it crosses the bridge intact. */
const invoke = <T>(channel: string, payload: unknown): Promise<Result<T, IpcError>> =>
  ipcRenderer.invoke(channel, payload) as Promise<Result<T, IpcError>>

export const workspaceApi: WorkspaceApi = {
  list: () => invoke<readonly WorkspaceSummary[]>(IPC.workspace.list, undefined),

  get: (id: string) => invoke<Workspace>(IPC.workspace.get, { id }),

  save: (input: WorkspaceInput) => invoke<Workspace>(IPC.workspace.save, input),

  delete: (id: string) => invoke<null>(IPC.workspace.delete, { id })
}
