import { resolve } from 'node:path'
import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import type { DataFolderInfo } from '@shared/contracts/storage'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { DataRootResolution } from './dataRoot'
import type { IpcHandlerRegistry } from './ipcPorts'
import type { Logger } from './logger'

export interface DataRootIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly resolution: DataRootResolution
  /**
   * The native folder picker, injected so this module is testable without
   * Electron. Resolves to the chosen absolute path, or null on cancel. The
   * renderer never supplies a path — this dialog is the only source of one.
   */
  readonly pickFolder: (defaultPath: string) => Promise<string | null>
  /** Copies current data into the target and records the pointer. Throws. */
  readonly applySwitch: (target: string) => void
  readonly logger: Logger
}

/**
 * The data-folder IPC (Phase 17). Bootstrap-owned like the storage manifest:
 * the data root is resolved before any feature exists, so no feature can own
 * it. A switch takes effect on the next launch — swapping the stores under
 * live terminals and services mid-run is a restart pretending to not be one.
 */
export const registerDataRootIpc = ({
  registry,
  resolution,
  pickFolder,
  applySwitch,
  logger
}: DataRootIpcDependencies): void => {
  let pending: string | null = null

  const describe = (): DataFolderInfo => ({
    current: resolution.dataRoot,
    defaultRoot: resolution.defaultRoot,
    isCustom: resolution.isCustom,
    pending
  })

  registry.handle(IPC.storage.info, (payload): Result<DataFolderInfo, IpcError> => {
    if (payload !== undefined) {
      return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'info takes no payload' })
    }
    return Ok(describe())
  })

  registry.handle(
    IPC.storage.choose,
    async (payload): Promise<Result<DataFolderInfo | null, IpcError>> => {
      if (payload !== undefined) {
        return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'choose takes no payload' })
      }

      const chosen = await pickFolder(pending ?? resolution.dataRoot)
      if (chosen === null) return Ok(null)

      const target = resolve(chosen)
      try {
        if (target === resolve(resolution.dataRoot)) {
          // Re-choosing the folder in use cancels any pending switch.
          applySwitch(target)
          pending = null
          return Ok(describe())
        }

        applySwitch(target)
        pending = target
        logger.info('data folder switch recorded, applies on next launch', { target })
        return Ok(describe())
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn('data folder switch failed', { target, error })
        return Err({
          code: IPC_ERROR_CODES.internal,
          message: `could not switch the data folder: ${message}`
        })
      }
    }
  )
}
