/**
 * Explicit success/failure value, used where a failure is an expected outcome
 * rather than an exceptional one.
 */
export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })
