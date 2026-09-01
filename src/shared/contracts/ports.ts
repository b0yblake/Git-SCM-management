/**
 * The serializable port-management contract — everything that crosses the
 * Main ↔ renderer boundary for Phase 12.
 *
 * The renderer sees ports and processes as *descriptions*. The only thing it
 * may ever send back is an opaque capability (`targetId`) minted by Main for
 * one snapshot: there is deliberately no type here through which a PID,
 * process name, command, signal or executable path could travel renderer →
 * Main.
 *
 * Every type must survive `structuredClone`: no classes, no functions, no
 * `Error` instances.
 */

export type PortProtocol = 'tcp' | 'udp'

/** One local endpoint: a TCP listener or a bound UDP socket. */
export interface PortBinding {
  readonly protocol: PortProtocol
  readonly localAddress: string
  readonly localPort: number
}

export type PortTerminationBlockReason =
  'system-process' | 'gitdeck-process' | 'different-session' | 'identity-unavailable'

/**
 * One selectable row: a process and every binding it owns. Selecting it means
 * "terminate this process", which releases *all* of its bindings — the modal
 * exists to make that blast radius visible.
 */
export interface PortProcess {
  /** Opaque capability minted by Main for this snapshot. It is not a PID. */
  readonly targetId: string
  readonly pid: number
  readonly processName: string
  readonly startedAt: number | null
  readonly bindings: readonly PortBinding[]
  readonly canTerminate: boolean
  readonly blockedReason?: PortTerminationBlockReason
}

export interface PortSnapshot {
  readonly id: string
  readonly capturedAt: number
  readonly processes: readonly PortProcess[]
}

export interface TerminatePortProcessesRequest {
  readonly snapshotId: string
  readonly targetIds: readonly string[]
}

/**
 * Codes: `access-denied` · `stale-identity` · `stale-bindings` ·
 * `not-released` · `verify-failed` · `termination-failed`. A code, not a
 * boolean, because "you may not" and "it came back" need different advice.
 */
export interface PortTerminationFailure {
  readonly targetId: string
  readonly code: string
  readonly message: string
}

export interface TerminatePortProcessesResult {
  readonly terminatedTargetIds: readonly string[]
  readonly alreadyExitedTargetIds: readonly string[]
  readonly failures: readonly PortTerminationFailure[]
}

/**
 * How long a snapshot stays actionable. Main retains exactly one snapshot and
 * never an unbounded history of process capabilities; a modal older than this
 * gets a stable error and refreshes.
 */
export const PORT_SNAPSHOT_TTL_MS = 300_000

/** Upper bound on `targetIds` per terminate request. */
export const MAX_PORT_TERMINATION_TARGETS = 50
