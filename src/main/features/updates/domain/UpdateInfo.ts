import type { UpdateCheckResult, UpdateInfo } from '@shared/contracts/updates'

/**
 * The serializable update models live in `@shared/contracts/updates` because
 * the renderer receives them over IPC. Re-exported here so the rest of the
 * feature imports from its own domain folder (ARCHITECTURE.md §4).
 */
export type { UpdateCheckResult, UpdateInfo }

/** The one repository GitDeck ever checks. A constant, never configuration. */
export const GITHUB_REPO = 'b0yblake/Git-SCM-management'

/**
 * What the release client answers with — the few fields the service needs,
 * already type-checked. Anything else in the API response is discarded at the
 * infrastructure boundary.
 */
export interface LatestRelease {
  readonly tagName: string
  readonly draft: boolean
  readonly prerelease: boolean
  /** Epoch ms; null when the response carries no readable date. */
  readonly publishedAt: number | null
}

export interface ReleaseClient {
  fetchLatest(): Promise<LatestRelease>
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** `"1.2.3"` → `[1, 2, 3]`; anything else → null. Strict on purpose. */
export const parseVersion = (value: string): readonly [number, number, number] | null => {
  const match = SEMVER.exec(value)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** `"v1.2.3"` → `"1.2.3"`; a tag in any other shape → null. */
export const parseReleaseTag = (tag: string): string | null => {
  if (!tag.startsWith('v')) return null
  const version = tag.slice(1)
  return parseVersion(version) ? version : null
}

/**
 * Numeric, component-wise comparison — `0.10.0 > 0.9.0`. Unparseable input is
 * never "newer": a garbled tag must not produce an update prompt.
 */
export const isNewerVersion = (candidate: string, current: string): boolean => {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false

  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

/**
 * The only URL the app ever opens for an update: minted from a version this
 * module already validated, never taken from a response body.
 */
export const releaseUrlFor = (version: string): string =>
  `https://github.com/${GITHUB_REPO}/releases/tag/v${version}`
