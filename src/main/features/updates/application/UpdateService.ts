import type { Logger } from '@main/bootstrap/logger'
import {
  isNewerVersion,
  parseReleaseTag,
  releaseUrlFor,
  type ReleaseClient,
  type UpdateCheckResult,
  type UpdateInfo
} from '../domain/UpdateInfo'

/** At most one automatic request per day; a manual check bypasses this. */
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface UpdateServiceOptions {
  readonly client: ReleaseClient
  /** `app.getVersion()` — e.g. "0.1.0". */
  readonly currentVersion: string
  /** Live settings read; the user can toggle the check while the app runs. */
  readonly getSettings: () => {
    readonly checkForUpdatesOnStartup: boolean
    readonly skippedUpdateVersion: string | null
  }
  /** Throttle bookkeeping, persisted in storage.json — not a preference. */
  readonly readLastCheckAt: () => number | null
  readonly recordCheckAt: (at: number) => void
  readonly logger: Logger
  readonly now?: () => number
}

/**
 * The update use case: compare, throttle, respect the skip — and never let a
 * failure escape as noise. The only state kept is the last minted
 * `UpdateInfo`, which is what the openRelease IPC handler is allowed to open.
 */
export class UpdateService {
  readonly #options: Required<Pick<UpdateServiceOptions, 'now'>> & UpdateServiceOptions
  #latest: UpdateInfo | null = null

  constructor(options: UpdateServiceOptions) {
    this.#options = { now: Date.now, ...options }
  }

  /** The release the last check found — the only URL openRelease may open. */
  getLatest(): UpdateInfo | null {
    return this.#latest
  }

  /**
   * The startup path. Answers `null` when there is nothing to do — the check
   * is disabled, or an automatic check already ran within the last day — and
   * a result otherwise. A skipped version comes back as `up-to-date`, so the
   * caller can push only `update-available` and silence stays guaranteed.
   */
  async checkOnStartup(): Promise<UpdateCheckResult | null> {
    const { getSettings, readLastCheckAt, now } = this.#options
    if (!getSettings().checkForUpdatesOnStartup) return null

    const last = readLastCheckAt()
    if (last !== null && now() - last < AUTO_CHECK_INTERVAL_MS) return null

    const result = await this.#perform()
    if (
      result.status === 'update-available' &&
      result.latest?.version === getSettings().skippedUpdateVersion
    ) {
      return { status: 'up-to-date', currentVersion: result.currentVersion, latest: null }
    }
    return result
  }

  /** The Settings button. Ignores the gate, the throttle and the skip. */
  checkNow(): Promise<UpdateCheckResult> {
    return this.#perform()
  }

  async #perform(): Promise<UpdateCheckResult> {
    const { client, currentVersion, recordCheckAt, logger, now } = this.#options
    // Recorded on the attempt, not the outcome: the throttle bounds requests,
    // and a failing endpoint retried every launch would defeat it.
    recordCheckAt(now())

    let tagName: string
    let draft: boolean
    let prerelease: boolean
    let publishedAt: number | null
    try {
      ;({ tagName, draft, prerelease, publishedAt } = await client.fetchLatest())
    } catch (error) {
      logger.debug('update check failed', { error })
      return { status: 'check-failed', currentVersion, latest: null }
    }

    // `/releases/latest` excludes drafts and prereleases by contract; the
    // flags are re-checked anyway so a contract change cannot produce a prompt.
    if (draft || prerelease) {
      return { status: 'up-to-date', currentVersion, latest: null }
    }

    const version = parseReleaseTag(tagName)
    if (version === null) {
      logger.debug('update check returned an unreadable tag', { tagName })
      return { status: 'check-failed', currentVersion, latest: null }
    }

    if (!isNewerVersion(version, currentVersion)) {
      return { status: 'up-to-date', currentVersion, latest: null }
    }

    this.#latest = {
      version,
      releaseUrl: releaseUrlFor(version),
      publishedAt: publishedAt ?? 0
    }
    return { status: 'update-available', currentVersion, latest: this.#latest }
  }
}
