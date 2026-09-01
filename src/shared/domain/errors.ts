/**
 * Base class for errors that are part of the application's contract.
 *
 * `code` is stable and safe to send across IPC; `message` is for humans.
 * Feature-specific subclasses (ARCHITECTURE.md §9) are added by the phase that
 * introduces the feature they belong to.
 */
export abstract class AppError extends Error {
  abstract readonly code: string

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError
