import type { Unsubscribe } from '@shared/contracts/events'
import { IPC, IPC_ERROR_CODES, MAX_TERMINAL_DIMENSION, type IpcError } from '@shared/contracts/ipc'
import {
  isShellProfileId,
  type AvailableShellProfile,
  type TerminalCreateRequest
} from '@shared/contracts/terminal'
import { Err, Ok, type Result } from '@shared/domain/result'
import { isAppError } from '@shared/domain/errors'
import type { EventBroadcaster, IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import type { Logger } from '@main/bootstrap/logger'
import type { TerminalService } from '../application/TerminalService'
import type { TerminalSessionInfo } from '../domain/TerminalSession'

class InvalidRequestError extends Error {}

// The explicit annotation is what lets TypeScript treat a call to this as
// unreachable, so `invalid(...)` narrows types the way `throw` would.
const invalid: (message: string) => never = (message) => {
  throw new InvalidRequestError(message)
}

const asRecord = (payload: unknown): Record<string, unknown> =>
  typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : invalid('payload must be an object')

const requireString = (value: unknown, field: string): string =>
  typeof value === 'string' && value.length > 0
    ? value
    : invalid(`${field} must be a non-empty string`)

const optionalString = (value: unknown, field: string): string | undefined =>
  value === undefined ? undefined : requireString(value, field)

const requireDimension = (value: unknown, field: string): number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= MAX_TERMINAL_DIMENSION
    ? value
    : invalid(`${field} must be an integer between 1 and ${MAX_TERMINAL_DIMENSION}`)

const optionalDimension = (value: unknown, field: string): number | undefined =>
  value === undefined ? undefined : requireDimension(value, field)

/**
 * Rebuilds the request from known fields only, so an unknown extra field is
 * silently dropped rather than forwarded to the service.
 */
const parseCreateRequest = (payload: unknown): TerminalCreateRequest => {
  const raw = asRecord(payload)

  const shellProfileId = raw['shellProfileId']
  if (shellProfileId !== undefined && !isShellProfileId(shellProfileId)) {
    invalid('shellProfileId is not a known shell profile')
  }

  const cwd = optionalString(raw['cwd'], 'cwd')
  const title = optionalString(raw['title'], 'title')
  const startupCommand = optionalString(raw['startupCommand'], 'startupCommand')
  const cols = optionalDimension(raw['cols'], 'cols')
  const rows = optionalDimension(raw['rows'], 'rows')

  // `exactOptionalPropertyTypes` forbids assigning an explicit `undefined`.
  return {
    ...(cwd === undefined ? {} : { cwd }),
    ...(shellProfileId === undefined ? {} : { shellProfileId }),
    ...(title === undefined ? {} : { title }),
    ...(startupCommand === undefined ? {} : { startupCommand }),
    ...(cols === undefined ? {} : { cols }),
    ...(rows === undefined ? {} : { rows })
  }
}

const parseSessionId = (payload: unknown): string =>
  requireString(asRecord(payload)['sessionId'], 'sessionId')

/**
 * Converts any thrown value into something safe to serialize.
 *
 * Only `AppError` messages are passed through — they are written for the user.
 * Anything else collapses to a generic message so a stack trace or an absolute
 * path cannot reach the renderer.
 */
const toIpcError = (error: unknown): IpcError => {
  if (error instanceof InvalidRequestError) {
    return { code: IPC_ERROR_CODES.invalidRequest, message: error.message }
  }
  if (isAppError(error)) {
    return { code: error.code, message: error.message }
  }
  return { code: IPC_ERROR_CODES.internal, message: 'An unexpected error occurred.' }
}

export interface TerminalIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly broadcaster: EventBroadcaster
  readonly terminal: TerminalService
  readonly logger: Logger
}

/**
 * Registers the terminal channels.
 *
 * `create` and `kill` answer with a `Result` so a failure crosses as data.
 * `write` and `resize` are fire-and-forget per ARCHITECTURE.md §7 — a rejected
 * payload is logged here because there is no reply channel to carry it.
 *
 * Returns a function that detaches the PTY event forwarding.
 */
export const registerTerminalIpc = ({
  registry,
  broadcaster,
  terminal,
  logger
}: TerminalIpcDependencies): Unsubscribe => {
  registry.handle(IPC.terminal.create, (payload): Result<TerminalSessionInfo, IpcError> => {
    try {
      return Ok(terminal.create(parseCreateRequest(payload)))
    } catch (error) {
      logger.warn(`${IPC.terminal.create} rejected`, { error: toIpcError(error) })
      return Err(toIpcError(error))
    }
  })

  registry.handle(IPC.terminal.profiles, (): Result<readonly AvailableShellProfile[], IpcError> =>
    Ok(terminal.profiles())
  )

  registry.handle(IPC.terminal.kill, (payload): Result<null, IpcError> => {
    try {
      terminal.kill(parseSessionId(payload))
      return Ok(null)
    } catch (error) {
      logger.warn(`${IPC.terminal.kill} rejected`, { error: toIpcError(error) })
      return Err(toIpcError(error))
    }
  })

  registry.on(IPC.terminal.write, (payload) => {
    try {
      const raw = asRecord(payload)
      const sessionId = requireString(raw['sessionId'], 'sessionId')
      const data = raw['data']
      if (typeof data !== 'string') invalid('data must be a string')
      terminal.write(sessionId, data)
    } catch (error) {
      logger.warn(`${IPC.terminal.write} rejected`, { error: toIpcError(error) })
    }
  })

  registry.on(IPC.terminal.resize, (payload) => {
    try {
      const raw = asRecord(payload)
      terminal.resize(
        requireString(raw['sessionId'], 'sessionId'),
        requireDimension(raw['cols'], 'cols'),
        requireDimension(raw['rows'], 'rows')
      )
    } catch (error) {
      logger.warn(`${IPC.terminal.resize} rejected`, { error: toIpcError(error) })
    }
  })

  const detachData = terminal.onData((event) => {
    broadcaster.send(IPC.terminal.data, event)
  })
  const detachExit = terminal.onExit((event) => {
    broadcaster.send(IPC.terminal.exit, event)
  })

  return () => {
    detachData()
    detachExit()
  }
}
