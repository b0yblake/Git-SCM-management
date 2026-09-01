import { ipcRenderer } from 'electron'
import type { GitRepositoryStatus } from '@shared/contracts/git'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import type { GitApi } from './api'

export const gitApi: GitApi = {
  inspect: (path: string) =>
    ipcRenderer.invoke(IPC.git.inspect, { path }) as Promise<
      Result<GitRepositoryStatus | null, IpcError>
    >
}
