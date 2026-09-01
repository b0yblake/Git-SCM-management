import { describe, expect, it, vi } from 'vitest'
import { UpdateCheckFailedError } from '../domain/errors'
import {
  createGitHubReleaseClient,
  LATEST_RELEASE_URL,
  RELEASE_MAX_RESPONSE_BYTES
} from './GitHubReleaseClient'

const release = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    tag_name: 'v0.2.0',
    draft: false,
    prerelease: false,
    published_at: '2026-09-01T00:00:00Z',
    ...overrides
  })

const respondingWith = (body: string, status = 200): typeof fetch =>
  vi.fn(() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch

describe('request shape — no test can make it request anything else', () => {
  it('requests exactly the constant URL with the pinned headers', async () => {
    const fetchFn = respondingWith(release())

    await createGitHubReleaseClient({ fetchFn }).fetchLatest()

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ]
    expect(url).toBe(LATEST_RELEASE_URL)
    expect(url).toBe('https://api.github.com/repos/b0yblake/Git-SCM-management/releases/latest')
    expect(init.headers).toEqual({
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GitDeck'
    })
  })

  it('sets no authorization, cookie or user-identifying header', async () => {
    const fetchFn = respondingWith(release())

    await createGitHubReleaseClient({ fetchFn }).fetchLatest()

    const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ]
    const headers = Object.keys(init.headers as Record<string, string>).map((h) =>
      h.toLowerCase()
    )
    expect(headers).not.toContain('authorization')
    expect(headers).not.toContain('cookie')
  })
})

describe('parsing', () => {
  it('returns the four fields the service needs', async () => {
    const client = createGitHubReleaseClient({ fetchFn: respondingWith(release()) })

    expect(await client.fetchLatest()).toEqual({
      tagName: 'v0.2.0',
      draft: false,
      prerelease: false,
      publishedAt: Date.parse('2026-09-01T00:00:00Z')
    })
  })

  it('an unreadable publish date becomes null, not a crash', async () => {
    const client = createGitHubReleaseClient({
      fetchFn: respondingWith(release({ published_at: 'yesterday' }))
    })

    expect((await client.fetchLatest()).publishedAt).toBeNull()
  })

  it('a crafted html_url in the response is simply not part of the model', async () => {
    const client = createGitHubReleaseClient({
      fetchFn: respondingWith(release({ html_url: 'https://evil.example/download.exe' }))
    })

    expect(await client.fetchLatest()).not.toHaveProperty('htmlUrl')
  })
})

describe('failures — every one becomes UpdateCheckFailedError', () => {
  it('a non-2xx status', async () => {
    const client = createGitHubReleaseClient({ fetchFn: respondingWith('{}', 404) })

    await expect(client.fetchLatest()).rejects.toThrow(UpdateCheckFailedError)
  })

  it('a body that is not JSON', async () => {
    const client = createGitHubReleaseClient({ fetchFn: respondingWith('<html>rate limited') })

    await expect(client.fetchLatest()).rejects.toThrow(UpdateCheckFailedError)
  })

  it('a release with no tag name', async () => {
    const client = createGitHubReleaseClient({ fetchFn: respondingWith('{"draft":false}') })

    await expect(client.fetchLatest()).rejects.toThrow(UpdateCheckFailedError)
  })

  it('a body over the byte cap is abandoned', async () => {
    const oversized = release({ body: 'x'.repeat(RELEASE_MAX_RESPONSE_BYTES + 1) })
    const client = createGitHubReleaseClient({ fetchFn: respondingWith(oversized) })

    await expect(client.fetchLatest()).rejects.toThrow(/too large/)
  })

  it('a network rejection', async () => {
    const fetchFn = vi.fn(() =>
      Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    ) as unknown as typeof fetch
    const client = createGitHubReleaseClient({ fetchFn })

    await expect(client.fetchLatest()).rejects.toThrow(UpdateCheckFailedError)
  })

  it('the timeout aborts the request', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        })
    ) as unknown as typeof fetch
    const client = createGitHubReleaseClient({ fetchFn, timeoutMs: 5 })

    await expect(client.fetchLatest()).rejects.toThrow(UpdateCheckFailedError)
  })
})
