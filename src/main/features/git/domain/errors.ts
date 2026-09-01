import { AppError } from '@shared/domain/errors'

/**
 * Git is not installed, or not on PATH.
 *
 * Not a failure of the application: `GitService` catches this, logs it once,
 * and answers with `null` so the UI simply has no badge to show.
 */
export class GitNotAvailableError extends AppError {
  readonly code = 'GIT_NOT_AVAILABLE'

  constructor() {
    super('Git is not installed, or not on PATH.')
  }
}

/** Output that does not match the porcelain v2 format this build understands. */
export class GitOutputError extends AppError {
  readonly code = 'GIT_OUTPUT_INVALID'

  constructor(reason: string) {
    super(`Could not read git output: ${reason}`)
  }
}

/** A git invocation that had to be killed. Never surfaced to the renderer. */
export class GitTimeoutError extends AppError {
  readonly code = 'GIT_TIMEOUT'

  constructor(readonly timeoutMs: number) {
    super(`git did not finish within ${timeoutMs}ms and was stopped.`)
  }
}
