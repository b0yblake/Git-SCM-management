import {
  MAX_PORT_TERMINATION_TARGETS,
  type PortSnapshot,
  type TerminatePortProcessesRequest,
  type TerminatePortProcessesResult
} from '@shared/contracts/ports'
import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { isAppError } from '@shared/domain/errors'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import type { Logger } from '@main/bootstrap/logger'
import type { PortService } from '../application/PortService'
import { InvalidPortRequestError } from '../domain/errors'

const toIpcError = (error: unknown): IpcError =>
  isAppError(error)
    ? { code: error.code, message: error.message }
    : { code: IPC_ERROR_CODES.internal, message: 'An unexpected error occurred.' }

/**
 * The strictest input parser in the application, on purpose: what comes out of
 * it authorizes process termination.
 *
 * The payload must be exactly `{ snapshotId, targetIds }` — a request smuggling
 * `pid`, `processName`, `command`, `signal` or any other field is rejected
 * before the service ever sees it, as are empty, duplicated, non-string or
 * more than 50 target ids.
 */
export const parseTerminateRequest = (payload: unknown): TerminatePortProcessesRequest => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new InvalidPortRequestError('payload must be an object')
  }

  const keys = Object.keys(payload).sort()
  if (keys.length !== 2 || keys[0] !== 'snapshotId' || keys[1] !== 'targetIds') {
    throw new InvalidPortRequestError('payload must hold exactly snapshotId and targetIds')
  }

  const { snapshotId, targetIds } = payload as Record<'snapshotId' | 'targetIds', unknown>
  if (typeof snapshotId !== 'string' || snapshotId.length === 0) {
    throw new InvalidPortRequestError('snapshotId must be a non-empty string')
  }
  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    throw new InvalidPortRequestError('targetIds must be a non-empty array')
  }
  if (targetIds.length > MAX_PORT_TERMINATION_TARGETS) {
    throw new InvalidPortRequestError(
      `targetIds must hold at most ${MAX_PORT_TERMINATION_TARGETS} ids`
    )
  }
  if (!targetIds.every((id): id is string => typeof id === 'string' && id.length > 0)) {
    throw new InvalidPortRequestError('every target id must be a non-empty string')
  }
  if (new Set(targetIds).size !== targetIds.length) {
    throw new InvalidPortRequestError('target ids must be unique')
  }

  return { snapshotId, targetIds }
}

export interface PortsIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly ports: PortService
  readonly logger: Logger
}

/**
 * Registers the two request/response port channels. (The open event is a
 * Main → renderer push owned by the application menu; nothing to handle here.)
 */
export const registerPortsIpc = ({ registry, ports, logger }: PortsIpcDependencies): void => {
  registry.handle(IPC.ports.list, async (): Promise<Result<PortSnapshot, IpcError>> => {
    try {
      return Ok(await ports.list())
    } catch (error) {
      const failure = toIpcError(error)
      logger.warn(`${IPC.ports.list} rejected`, { error: failure })
      return Err(failure)
    }
  })

  registry.handle(
    IPC.ports.terminate,
    async (payload): Promise<Result<TerminatePortProcessesResult, IpcError>> => {
      try {
        return Ok(await ports.terminate(parseTerminateRequest(payload)))
      } catch (error) {
        const failure = toIpcError(error)
        logger.warn(`${IPC.ports.terminate} rejected`, { error: failure })
        return Err(failure)
      }
    }
  )
}
