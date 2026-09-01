import { AppError } from '@shared/domain/errors'

/** Enumeration failed: PowerShell missing a cmdlet, unreadable output, … */
export class PortInspectionError extends AppError {
  readonly code = 'PORT_INSPECTION_FAILED'

  constructor(reason: string) {
    super(`Could not inspect local ports: ${reason}`)
  }
}

/** The inspector ran too long and was killed. */
export class PortInspectionTimeoutError extends AppError {
  readonly code = 'PORT_INSPECTION_TIMEOUT'

  constructor(readonly timeoutMs: number) {
    super(`Port inspection did not finish within ${timeoutMs}ms and was stopped.`)
  }
}

/**
 * The snapshot a terminate request names is not the current one — replaced by
 * a refresh, expired, or never issued. The stable answer a stale modal gets:
 * it refreshes and the user re-selects against reality.
 */
export class PortSnapshotStaleError extends AppError {
  readonly code = 'PORT_SNAPSHOT_STALE'

  constructor() {
    super('This port list is out of date. Refresh and select again.')
  }
}

/**
 * A terminate request that Main never issued the capability for: an unknown
 * target id, or a target Main marked non-terminable. A well-behaved renderer
 * cannot produce this, so it is rejected whole — before any command starts.
 */
export class InvalidPortRequestError extends AppError {
  readonly code = 'PORT_REQUEST_INVALID'

  constructor(reason: string) {
    super(`Invalid port request: ${reason}`)
  }
}

/**
 * The OS refused the kill. A per-target failure and never a reason to elevate:
 * relaunching as Administrator is explicitly out of scope.
 */
export class PortAccessDeniedError extends AppError {
  readonly code = 'PORT_ACCESS_DENIED'

  constructor() {
    super('Windows denied terminating this process.')
  }
}

/** `taskkill` failed for a reason other than permission or a vanished target. */
export class PortTerminationError extends AppError {
  readonly code = 'PORT_TERMINATION_FAILED'

  constructor(reason: string) {
    super(`Could not terminate the process: ${reason}`)
  }
}
