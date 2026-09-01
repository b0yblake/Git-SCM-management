/**
 * Update-check contracts (Phase 16).
 *
 * The renderer only ever *receives* these: the check result crosses IPC from
 * Main, and the one action a renderer may request — opening the release page —
 * carries no payload at all. There is deliberately no type here through which
 * a URL could travel renderer → Main.
 */

export interface UpdateInfo {
  /** Validated semver, no leading `v` — e.g. "0.2.0". */
  readonly version: string
  /** Minted by Main from the validated tag; never taken from a response body. */
  readonly releaseUrl: string
  /** Epoch ms; 0 when the release carries no readable publish date. */
  readonly publishedAt: number
}

export type UpdateCheckStatus = 'up-to-date' | 'update-available' | 'check-failed' | 'disabled'

export interface UpdateCheckResult {
  readonly status: UpdateCheckStatus
  readonly currentVersion: string
  readonly latest: UpdateInfo | null
}
