import { isId } from '../domain/ids'
import type { TerminalDefinition } from './terminal'

/**
 * The serializable workspace contract — everything that crosses the Main ↔
 * renderer boundary *and* everything that is written to disk.
 *
 * It lives in `shared/` for the same reason the terminal contract does: the
 * renderer needs these types and may not import Main-process code
 * (ARCHITECTURE.md §2).
 *
 * A `Workspace` is a **definition**, never a runtime record. It holds
 * `TerminalDefinition`s (`term_*` ids, minted when a terminal is configured),
 * never `TerminalSessionInfo` (`sess_*` ids, minted when a PTY is spawned).
 * That distinction is the whole point of this phase.
 */

export const WORKSPACE_VERSION = 1

export const WORKSPACE_ID_PREFIX = 'ws'

export const isWorkspaceId = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(`${WORKSPACE_ID_PREFIX}_`) && isId(value)

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly version: typeof WORKSPACE_VERSION
  readonly terminals: readonly TerminalDefinition[]
  /**
   * Always names one of `terminals`, or is absent. A value pointing at a
   * terminal that was removed is dropped during validation rather than
   * preserved — see `parseWorkspaceInput`.
   */
  readonly activeTerminalId?: string
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * What `list()` answers with. Deliberately excludes `terminals`: a sidebar
 * needs a name and a count, and sending every definition would make the
 * response grow with the number of terminals the user has configured.
 */
export interface WorkspaceSummary {
  readonly id: string
  readonly name: string
  readonly terminalCount: number
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * Everything a caller may supply to `save()`.
 *
 * `version`, `createdAt` and `updatedAt` are absent on purpose: they are owned
 * by Main. A renderer that could set `updatedAt` could make an older workspace
 * look newer than it is.
 *
 * An absent `id` means "create"; a present one means "overwrite".
 */
export interface WorkspaceInput {
  readonly id?: string
  readonly name: string
  readonly terminals: readonly TerminalDefinition[]
  readonly activeTerminalId?: string
}
