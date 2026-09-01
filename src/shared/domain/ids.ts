/**
 * Identifier format: `<prefix>_<uuid-v4>` — e.g. `term_9f1c...`.
 *
 * Uses the Web Crypto global so the same module works in Main and in the
 * renderer without importing `node:crypto`.
 */
export const createId = (prefix: string): string => `${prefix}_${globalThis.crypto.randomUUID()}`

const ID_PATTERN = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isId = (value: string): boolean => ID_PATTERN.test(value)
