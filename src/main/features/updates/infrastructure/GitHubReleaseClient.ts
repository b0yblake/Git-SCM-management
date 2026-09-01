import { UpdateCheckFailedError } from '../domain/errors'
import { GITHUB_REPO, type LatestRelease, type ReleaseClient } from '../domain/UpdateInfo'

/**
 * The only URL this client ever requests. A constant composed from the domain
 * constant — nothing from settings, the renderer or a previous response is
 * ever interpolated into it.
 */
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

export const RELEASE_FETCH_TIMEOUT_MS = 5_000
/** An honest release object is ~2KB; 256KB means something is wrong. */
export const RELEASE_MAX_RESPONSE_BYTES = 256 * 1024

export interface GitHubReleaseClientOptions {
  /** Injectable for tests; the global `fetch` in production. */
  readonly fetchFn?: typeof fetch
  readonly timeoutMs?: number
  readonly maxBytes?: number
}

/** Reads the body with a hard cap, so a hostile response cannot balloon. */
const readBounded = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) {
    const text = await response.text()
    if (text.length > maxBytes) throw new UpdateCheckFailedError('response too large')
    return text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new UpdateCheckFailedError('response too large')
    }
    chunks.push(value)
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(combined)
}

const parseRelease = (text: string): LatestRelease => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new UpdateCheckFailedError('response is not JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UpdateCheckFailedError('response is not a release object')
  }

  const record = raw as Record<string, unknown>
  const tagName = record['tag_name']
  if (typeof tagName !== 'string' || tagName.length === 0) {
    throw new UpdateCheckFailedError('release has no tag name')
  }

  const publishedAtRaw = record['published_at']
  const parsed = typeof publishedAtRaw === 'string' ? Date.parse(publishedAtRaw) : Number.NaN

  return {
    tagName,
    draft: record['draft'] === true,
    prerelease: record['prerelease'] === true,
    publishedAt: Number.isFinite(parsed) ? parsed : null
  }
}

/**
 * One anonymous, bounded GET against the GitHub Releases API. No token, no
 * cookie, no user identifier — the User-Agent names the app because GitHub
 * requires one, nothing more. Every failure becomes `UpdateCheckFailedError`;
 * the service turns that into a silent `check-failed`.
 */
export const createGitHubReleaseClient = ({
  fetchFn = fetch,
  timeoutMs = RELEASE_FETCH_TIMEOUT_MS,
  maxBytes = RELEASE_MAX_RESPONSE_BYTES
}: GitHubReleaseClientOptions = {}): ReleaseClient => ({
  fetchLatest: async (): Promise<LatestRelease> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetchFn(LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'GitDeck' },
        signal: controller.signal
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new UpdateCheckFailedError(`request failed: ${message}`)
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new UpdateCheckFailedError(`unexpected status ${response.status}`)
    }

    return parseRelease(await readBounded(response, maxBytes))
  }
})
