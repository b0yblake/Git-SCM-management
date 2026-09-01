import type { Logger } from '@main/bootstrap/logger'
import { GitNotAvailableError } from '../domain/errors'
import type { GitAdapter } from '../domain/GitAdapter'
import type { GitRepositoryStatus } from '../domain/GitRepositoryStatus'

export interface GitServiceOptions {
  /**
   * Minimum time between real git invocations for the same path.
   *
   * This is what the plan calls debounce: the UI polls freely and asks again on
   * every focus change, and only one invocation per path per window reaches
   * git. A trailing debounce would leave callers without an answer; a short
   * cache gives every caller one while spawning a single process.
   */
  readonly cacheTtlMs?: number
  readonly now?: () => number
}

export const DEFAULT_CACHE_TTL_MS = 2_000

/**
 * Read-only Git awareness.
 *
 * Every failure resolves to `null` rather than propagating: Git is additive
 * metadata, so a missing binary or an unreadable repository must cost the user
 * a badge, never a working terminal.
 */
export class GitService {
  readonly #adapter: GitAdapter
  readonly #logger: Logger
  readonly #ttl: number
  readonly #now: () => number
  readonly #cache = new Map<string, { at: number; value: GitRepositoryStatus | null }>()
  readonly #inFlight = new Map<string, Promise<GitRepositoryStatus | null>>()
  #gitIsMissing = false

  constructor(adapter: GitAdapter, logger: Logger, options: GitServiceOptions = {}) {
    this.#adapter = adapter
    this.#logger = logger
    this.#ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.#now = options.now ?? Date.now
  }

  /** The status for the repository containing `path`, or `null`. */
  async inspect(path: string): Promise<GitRepositoryStatus | null> {
    // Once git has been shown to be absent, never spawn again: the alternative
    // is a failed process on every poll for the rest of the session.
    if (this.#gitIsMissing) return null

    const cached = this.#cache.get(path)
    if (cached && this.#now() - cached.at < this.#ttl) return cached.value

    // A second request for a path already being inspected joins the first
    // rather than starting an overlapping git process.
    const running = this.#inFlight.get(path)
    if (running) return running

    const pending = this.#load(path).finally(() => {
      this.#inFlight.delete(path)
    })
    this.#inFlight.set(path, pending)
    return pending
  }

  async #load(path: string): Promise<GitRepositoryStatus | null> {
    try {
      const repositoryRoot = await this.#adapter.repositoryRoot(path)
      if (repositoryRoot === null) return this.#remember(path, null)

      const counts = await this.#adapter.status(repositoryRoot)
      return this.#remember(path, { repositoryRoot, ...counts })
    } catch (error) {
      if (error instanceof GitNotAvailableError) {
        // Once, not once per poll.
        this.#gitIsMissing = true
        this.#logger.info('git is not available; repository status is disabled')
      } else {
        this.#logger.warn('git inspect failed', { path, error })
      }
      return this.#remember(path, null)
    }
  }

  #remember(path: string, value: GitRepositoryStatus | null): GitRepositoryStatus | null {
    this.#cache.set(path, { at: this.#now(), value })
    return value
  }
}
