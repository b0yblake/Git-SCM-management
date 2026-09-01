// Public surface of the terminal feature (ARCHITECTURE.md §4).
// Other features and the composition root may import from this file only —
// never from domain/, application/, infrastructure/ or testing/.
import type { Logger } from '@main/bootstrap/logger'
import { TerminalManager } from './application/TerminalManager'
import { TerminalService, type TerminalServiceOptions } from './application/TerminalService'
import { NodePtyAdapter } from './infrastructure/NodePtyAdapter'
import { createShellRegistry, pickDefaultShellProfileId } from './infrastructure/shellProfiles'
import { detectInstalledShellProfiles } from './infrastructure/WindowsShellDetector'
import type { ShellRegistry } from './domain/ShellProfile'

export interface CreateTerminalServiceOptions extends TerminalServiceOptions {
  readonly shells: ShellRegistry
}

/**
 * Wires the feature's own internals so the composition root never has to know
 * that `NodePtyAdapter` or `TerminalManager` exist.
 */
export const createTerminalService = (
  logger: Logger,
  { shells, ...options }: CreateTerminalServiceOptions
): TerminalService =>
  new TerminalService(new TerminalManager(new NodePtyAdapter(shells), logger), options)

export { TerminalService }

export { createShellRegistry, pickDefaultShellProfileId }
export { detectInstalledShellProfiles }

export { registerTerminalIpc, type TerminalIpcDependencies } from './ipc/terminalIpc'

export {
  NoShellAvailableError,
  ShellNotFoundError,
  TerminalSessionNotFoundError
} from './domain/errors'

export type {
  ShellCommand,
  ShellProfile,
  ShellProfileId,
  ShellRegistry
} from './domain/ShellProfile'

export type {
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalDefinition,
  TerminalExitEvent,
  TerminalSessionInfo,
  TerminalSessionStatus,
  TerminalSize
} from './domain/TerminalSession'
