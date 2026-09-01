import { isShellProfileId, type TerminalDefinition } from '@shared/contracts/terminal'
import {
  isWorkspaceId,
  WORKSPACE_ID_PREFIX,
  WORKSPACE_VERSION,
  type Workspace,
  type WorkspaceInput,
  type WorkspaceSummary
} from '@shared/contracts/workspace'
import { InvalidWorkspaceError } from './errors'

/**
 * The serializable workspace models live in `@shared/contracts/workspace`
 * because the renderer needs them and may not import Main-process code. They
 * are re-exported here so the rest of the feature keeps importing from its own
 * domain folder.
 *
 * This file adds the part that must never live in `shared/`: validation. Both
 * directions go through it — a file read from disk and a payload arriving over
 * IPC are equally untrusted.
 */
export type { Workspace, WorkspaceInput, WorkspaceSummary }
export { isWorkspaceId, WORKSPACE_ID_PREFIX, WORKSPACE_VERSION }

// The explicit annotation is what lets TypeScript treat a call to this as
// unreachable, so `invalid(...)` narrows types the way `throw` would.
const invalid: (reason: string) => never = (reason) => {
  throw new InvalidWorkspaceError(reason)
}

const asRecord = (value: unknown, what: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid(`${what} must be an object`)

const requireString = (value: unknown, field: string): string =>
  typeof value === 'string' && value.length > 0
    ? value
    : invalid(`${field} must be a non-empty string`)

const optionalString = (value: unknown, field: string): string | undefined =>
  value === undefined ? undefined : requireString(value, field)

const requireTimestamp = (value: unknown, field: string): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : invalid(`${field} must be a timestamp`)

/**
 * Rebuilds a definition from known fields only.
 *
 * This is what keeps runtime state off the disk: a caller that hands over a
 * live session's data gets `sessionId`, `status` and `exitCode` dropped rather
 * than persisted. The id format is the terminal feature's business, so only
 * "non-empty string" is checked here.
 */
const parseTerminalDefinition = (value: unknown, index: number): TerminalDefinition => {
  const raw = asRecord(value, `terminals[${index}]`)

  const shellProfileId = raw['shellProfileId']
  if (!isShellProfileId(shellProfileId)) {
    invalid(`terminals[${index}].shellProfileId is not a known shell profile`)
  }

  const startupCommand = optionalString(raw['startupCommand'], `terminals[${index}].startupCommand`)

  // `exactOptionalPropertyTypes` forbids assigning an explicit `undefined`.
  return {
    id: requireString(raw['id'], `terminals[${index}].id`),
    title: requireString(raw['title'], `terminals[${index}].title`),
    cwd: requireString(raw['cwd'], `terminals[${index}].cwd`),
    shellProfileId,
    ...(startupCommand === undefined ? {} : { startupCommand })
  }
}

/** Validates what a caller may supply — no version, no timestamps. */
export const parseWorkspaceInput = (value: unknown): WorkspaceInput => {
  const raw = asRecord(value, 'workspace')

  const id = raw['id']
  if (id !== undefined && !isWorkspaceId(id)) invalid('id is not a workspace id')

  const terminals = raw['terminals']
  if (!Array.isArray(terminals)) invalid('terminals must be an array')
  const definitions = terminals.map(parseTerminalDefinition)

  // An `activeTerminalId` naming a terminal that is no longer in the list is a
  // stale reference, not a corrupt file — dropping it keeps the invariant
  // "active names one of terminals" true without failing the whole load.
  const requestedActive = optionalString(raw['activeTerminalId'], 'activeTerminalId')
  const activeTerminalId = definitions.some((terminal) => terminal.id === requestedActive)
    ? requestedActive
    : undefined

  return {
    ...(id === undefined ? {} : { id }),
    name: requireString(raw['name'], 'name'),
    terminals: definitions,
    ...(activeTerminalId === undefined ? {} : { activeTerminalId })
  }
}

/**
 * Validates a complete stored record.
 *
 * An unexpected `version` is rejected rather than migrated: there is exactly
 * one version today, so a file claiming any other was written by something
 * this build does not understand. This is the hook a future migration replaces.
 */
export const parseWorkspace = (value: unknown): Workspace => {
  const raw = asRecord(value, 'workspace')

  const version = raw['version']
  if (version !== WORKSPACE_VERSION) {
    invalid(`unsupported version ${JSON.stringify(version)} — expected ${WORKSPACE_VERSION}`)
  }

  const input = parseWorkspaceInput(raw)
  if (input.id === undefined) invalid('id is required')

  return {
    id: input.id,
    name: input.name,
    version: WORKSPACE_VERSION,
    terminals: input.terminals,
    ...(input.activeTerminalId === undefined ? {} : { activeTerminalId: input.activeTerminalId }),
    createdAt: requireTimestamp(raw['createdAt'], 'createdAt'),
    updatedAt: requireTimestamp(raw['updatedAt'], 'updatedAt')
  }
}

export const toSummary = (workspace: Workspace): WorkspaceSummary => ({
  id: workspace.id,
  name: workspace.name,
  terminalCount: workspace.terminals.length,
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt
})
