import { UpdateCheckFailedError } from '../domain/errors'
import type { LatestRelease, ReleaseClient } from '../domain/UpdateInfo'

export interface FakeReleaseClient extends ReleaseClient {
  /** How many times the network would have been touched. */
  fetchCount: number
  /** Script the next answers; `fail()` scripts a failure instead. */
  respondWith(release: Partial<LatestRelease>): void
  fail(message?: string): void
}

/** Scripted release answers; records every fetch so tests can assert zero. */
export const createFakeReleaseClient = (): FakeReleaseClient => {
  let release: LatestRelease = {
    tagName: 'v0.1.0',
    draft: false,
    prerelease: false,
    publishedAt: 1_756_700_000_000
  }
  let failure: string | null = null

  const client: FakeReleaseClient = {
    fetchCount: 0,
    respondWith: (partial) => {
      failure = null
      release = { ...release, ...partial }
    },
    fail: (message = 'scripted failure') => {
      failure = message
    },
    fetchLatest: () => {
      client.fetchCount += 1
      if (failure !== null) return Promise.reject(new UpdateCheckFailedError(failure))
      return Promise.resolve(release)
    }
  }
  return client
}
