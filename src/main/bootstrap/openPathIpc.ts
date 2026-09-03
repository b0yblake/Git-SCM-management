import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from './ipcPorts'
import type { OpenPathService } from './openPath'

export interface OpenPathIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly openPath: OpenPathService
}

/**
 * The pull half of Explorer's "Open in GitDeck" (Phase 18). Bootstrap-owned
 * like the data root: the launch argument exists before any feature does.
 * The renderer asks exactly once, after restore settles, so a restored
 * terminal at the same path is found rather than duplicated. The push half —
 * a second instance forwarding a directory — is sent from `index.ts` over
 * `IPC.terminal.openPath`.
 */
export const registerOpenPathIpc = ({ registry, openPath }: OpenPathIpcDependencies): void => {
  registry.handle(IPC.terminal.pendingOpenPath, (payload): Result<string | null, IpcError> => {
    if (payload !== undefined) {
      return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'pendingpath takes no payload' })
    }
    return Ok(openPath.takePending())
  })
}
