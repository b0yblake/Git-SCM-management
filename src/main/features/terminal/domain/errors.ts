import { AppError } from '@shared/domain/errors'

export class TerminalSessionNotFoundError extends AppError {
  readonly code = 'TERMINAL_SESSION_NOT_FOUND'

  constructor(readonly sessionId: string) {
    super(`No terminal session with id "${sessionId}"`)
  }
}

export class ShellNotFoundError extends AppError {
  readonly code = 'SHELL_NOT_FOUND'

  constructor(readonly shellProfileId: string) {
    super(`Shell profile "${shellProfileId}" is not available`)
  }
}

export class NoShellAvailableError extends AppError {
  readonly code = 'NO_SHELL_AVAILABLE'

  constructor() {
    super('No supported shell was found on this machine.')
  }
}
