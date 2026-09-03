import { statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { Logger } from './logger'

/**
 * The `--open-path <dir>` launch argument (Phase 18 — Explorer's
 * "Open in GitDeck").
 *
 * Arguments arrive from two directions: this process's own argv at a cold
 * start, and a second instance's argv forwarded through the single-instance
 * lock. Both go through the same validation — absolute, existing, a
 * directory — and anything else is logged and dropped rather than handed to
 * a shell. The queue holds one path: the renderer pulls it exactly once when
 * it is ready, and a fresh accept overwrites an unclaimed one.
 */
export const OPEN_PATH_FLAG = '--open-path'

export interface OpenPathService {
  /** Validates argv and queues the directory. Returns it, or null. */
  accept(argv: readonly string[]): string | null
  /** The queued directory, once; null afterwards and when none was queued. */
  takePending(): string | null
}

export interface OpenPathServiceOptions {
  readonly logger: Logger
  /** Injectable for tests; stats the real filesystem in production. */
  readonly isDirectory?: (path: string) => boolean
}

const defaultIsDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

const parseFlag = (argv: readonly string[]): string | null => {
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i]
    // A present flag with no value falls through to validation's warn.
    if (argument === OPEN_PATH_FLAG) return argv[i + 1] ?? ''
    if (argument?.startsWith(`${OPEN_PATH_FLAG}=`)) return argument.slice(OPEN_PATH_FLAG.length + 1)
  }
  return null
}

export const createOpenPathService = ({
  logger,
  isDirectory = defaultIsDirectory
}: OpenPathServiceOptions): OpenPathService => {
  let pending: string | null = null

  return {
    accept: (argv) => {
      const raw = parseFlag(argv)
      if (raw === null) return null

      if (raw.length === 0 || !isAbsolute(raw)) {
        logger.warn('ignoring --open-path that is not an absolute path', { raw })
        return null
      }
      const path = resolve(raw)
      if (!isDirectory(path)) {
        logger.warn('ignoring --open-path that is not an existing directory', { path })
        return null
      }

      pending = path
      return path
    },

    takePending: () => {
      const path = pending
      pending = null
      return path
    }
  }
}
