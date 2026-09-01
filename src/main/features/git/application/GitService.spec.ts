import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { GitNotAvailableError, GitOutputError, GitTimeoutError } from '../domain/errors'
import { createFakeGitAdapter, type FakeGitAdapter } from '../testing/FakeGitAdapter'
import { GitService } from './GitService'

const NESTED = 'D:\\Projects\\app\\src\\features'
const ROOT = 'D:\\Projects\\app'
const OUTSIDE = 'C:\\Users\\dev'

let adapter: FakeGitAdapter
let logger: FakeLogger
let clock: number

const service = (ttlMs = 2_000): GitService =>
  new GitService(adapter, logger, { cacheTtlMs: ttlMs, now: () => clock })

beforeEach(() => {
  clock = 1_000
  adapter = createFakeGitAdapter()
  logger = createFakeLogger()
  adapter.setRepository(NESTED, ROOT)
  adapter.setRepository(OUTSIDE, null)
  adapter.setStatus(ROOT, { branch: 'main', modified: 2 })
})

describe('inspecting', () => {
  it('resolves the repository root from a nested subdirectory', async () => {
    const status = await service().inspect(NESTED)

    expect(status?.repositoryRoot).toBe(ROOT)
    expect(adapter.calls.status).toEqual([ROOT])
  })

  it('returns the counts alongside the root', async () => {
    const status = await service().inspect(NESTED)

    expect(status).toEqual({
      repositoryRoot: ROOT,
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: 0,
      modified: 2,
      untracked: 0,
      conflicted: 0,
      isClean: true
    })
  })

  /** Not an error path: most directories are not repositories. */
  it('answers null outside a repository, without asking for a status', async () => {
    const status = await service().inspect(OUTSIDE)

    expect(status).toBeNull()
    expect(adapter.calls.status).toEqual([])
    expect(logger.entries).toEqual([])
  })
})

describe('failures never reach the caller as errors', () => {
  it('answers null when git is not installed', async () => {
    adapter.failWith(new GitNotAvailableError())

    await expect(service().inspect(NESTED)).resolves.toBeNull()
  })

  /** The requirement is "logged once rather than per poll". */
  it('reports a missing git once, however many times it is asked', async () => {
    adapter.failWith(new GitNotAvailableError())
    const git = service(0)

    for (let attempt = 0; attempt < 5; attempt++) {
      clock += 10_000
      await git.inspect(NESTED)
    }

    expect(logger.entries).toHaveLength(1)
  })

  it('stops spawning git entirely once it is known to be missing', async () => {
    adapter.failWith(new GitNotAvailableError())
    const git = service(0)

    await git.inspect(NESTED)
    clock += 10_000
    await git.inspect('D:\\Somewhere\\else')

    // One attempt, ever — not one per path and not one per poll.
    expect(adapter.calls.repositoryRoot).toEqual([NESTED])
  })

  it('answers null and warns when git output cannot be read', async () => {
    adapter.failWith(new GitOutputError('truncated'))

    await expect(service().inspect(NESTED)).resolves.toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('answers null and warns when git had to be killed', async () => {
    adapter.failWith(new GitTimeoutError(5_000))

    await expect(service().inspect(NESTED)).resolves.toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('an unreadable repository does not poison a readable one', async () => {
    const git = service(0)
    adapter.failWith(new GitOutputError('truncated'))
    await git.inspect(NESTED)

    adapter.failWith(null as unknown as Error)
    clock += 10_000

    await expect(git.inspect(NESTED)).resolves.not.toBeNull()
  })
})

/** "Polling is debounced and does not spawn overlapping git processes." */
describe('one invocation per path per window', () => {
  it('five requests inside the window produce one git invocation', async () => {
    const git = service()

    for (let attempt = 0; attempt < 5; attempt++) await git.inspect(NESTED)

    expect(adapter.calls.repositoryRoot).toEqual([NESTED])
  })

  it('asks again once the window has passed', async () => {
    const git = service(2_000)

    await git.inspect(NESTED)
    clock += 2_001
    await git.inspect(NESTED)

    expect(adapter.calls.repositoryRoot).toHaveLength(2)
  })

  it('a request while one is in flight joins it rather than overlapping', async () => {
    const git = service()
    const release = adapter.hold()

    const first = git.inspect(NESTED)
    const second = git.inspect(NESTED)
    release()

    expect(await first).toEqual(await second)
    expect(adapter.calls.repositoryRoot).toEqual([NESTED])
  })

  it('caches per path, so a second repository is still inspected', async () => {
    const other = 'E:\\Other'
    adapter.setRepository(other, other)
    const git = service()

    await git.inspect(NESTED)
    await git.inspect(other)

    expect(adapter.calls.repositoryRoot).toEqual([NESTED, other])
  })

  it('caches "not a repository" too, so a plain directory is not re-probed', async () => {
    const git = service()

    await git.inspect(OUTSIDE)
    await git.inspect(OUTSIDE)

    expect(adapter.calls.repositoryRoot).toEqual([OUTSIDE])
  })
})
