import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import type { UpdateCheckResult } from '@shared/contracts/updates'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import type { Logger } from '@main/bootstrap/logger'
import type { UpdateService } from '../application/UpdateService'

export interface UpdatesIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly updates: UpdateService
  /**
   * `shell.openExternal`, injected so the handler is testable without
   * Electron. It only ever receives the URL Main minted for the last check —
   * there is deliberately no channel through which the renderer could supply
   * one.
   */
  readonly openExternal: (url: string) => Promise<void>
  readonly logger: Logger
}

export const registerUpdatesIpc = ({
  registry,
  updates,
  openExternal,
  logger
}: UpdatesIpcDependencies): void => {
  registry.handle(
    IPC.updates.check,
    async (payload): Promise<Result<UpdateCheckResult, IpcError>> => {
      if (payload !== undefined) {
        return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'check takes no payload' })
      }
      try {
        return Ok(await updates.checkNow())
      } catch (error) {
        // checkNow reports failures as a status; reaching here is a bug.
        logger.warn(`${IPC.updates.check} failed unexpectedly`, { error })
        return Err({ code: IPC_ERROR_CODES.internal, message: 'update check failed' })
      }
    }
  )

  registry.handle(IPC.updates.release, (payload): Result<null, IpcError> => {
    if (payload !== undefined) {
      return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'release takes no payload' })
    }
    const latest = updates.getLatest()
    if (latest === null) {
      return Err({
        code: IPC_ERROR_CODES.invalidRequest,
        message: 'no release to open — run a check first'
      })
    }
    openExternal(latest.releaseUrl).catch((error: unknown) => {
      logger.warn('failed to open release page', { error })
    })
    return Ok(null)
  })
}
