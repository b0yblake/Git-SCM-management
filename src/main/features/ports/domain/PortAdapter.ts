import type { PortProtocol } from '@shared/contracts/ports'

/**
 * What the operating system reports, before any judgement is applied.
 *
 * `Raw` types are Main-internal: they carry PIDs and session ids that the
 * renderer must never receive directly. `PortService` turns them into the
 * shared `PortSnapshot` contract, replacing "act on this" with an opaque
 * capability.
 */
export interface RawPortBinding {
  readonly protocol: PortProtocol
  readonly localAddress: string
  readonly localPort: number
  readonly pid: number
}

/**
 * A process as the OS describes it. Any field can be unreadable — a protected
 * process exposes a binding while hiding its start time — and `null` here is
 * what makes the owning row visible but non-terminable.
 */
export interface RawProcessIdentity {
  readonly pid: number
  readonly name: string | null
  /** Start time in epoch milliseconds — the identity check against PID reuse. */
  readonly startedAt: number | null
  readonly sessionId: number | null
}

export interface PortInspection {
  readonly bindings: readonly RawPortBinding[]
  readonly processes: readonly RawProcessIdentity[]
}

export type PortTerminationOutcome = 'terminated' | 'already-exited'

/**
 * The OS boundary this feature stands on. `WindowsPortAdapter` implements it
 * with PowerShell and `taskkill.exe`; everything above it is testable with
 * `FakePortAdapter`.
 *
 * `terminate` takes a PID because Main has already validated it — nothing
 * renderer-supplied can reach this method. It throws `PortAccessDeniedError`
 * for a target the user may not kill, and reports a process that was already
 * gone as an outcome rather than an error, because that is a harmless race,
 * not a failure.
 */
export interface PortAdapter {
  inspect(): Promise<PortInspection>
  terminate(pid: number): Promise<PortTerminationOutcome>
}
