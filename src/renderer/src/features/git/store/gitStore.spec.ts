import { beforeEach, describe, expect, it } from 'vitest'
import type { GitRepositoryStatus } from '@shared/contracts/git'
import { useGitStore } from './gitStore'

const REPO = 'D:\\Projects\\app'

const status = (overrides: Partial<GitRepositoryStatus> = {}): GitRepositoryStatus => ({
  repositoryRoot: REPO,
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  isClean: true,
  ...overrides
})

const store = () => useGitStore.getState()

beforeEach(() => {
  useGitStore.getState().clear()
})

describe('gitStore', () => {
  it('starts with nothing to show', () => {
    expect(store().status).toBeNull()
    expect(store().inspectedPath).toBeNull()
  })

  it('remembers which path a status describes', () => {
    store().setStatus(REPO, status({ modified: 2 }))

    expect(store().inspectedPath).toBe(REPO)
    expect(store().status?.modified).toBe(2)
  })

  /** Null is a normal answer, not an absence of an answer. */
  it('records "no repository here" as a null status against the path', () => {
    store().setStatus('C:\\Users\\dev', null)

    expect(store().inspectedPath).toBe('C:\\Users\\dev')
    expect(store().status).toBeNull()
  })

  it('replaces the previous status rather than merging with it', () => {
    store().setStatus(REPO, status({ modified: 2 }))
    store().setStatus(REPO, status({ untracked: 1 }))

    expect(store().status?.modified).toBe(0)
    expect(store().status?.untracked).toBe(1)
  })

  it('clears back to nothing', () => {
    store().setStatus(REPO, status())

    store().clear()

    expect(store().status).toBeNull()
    expect(store().inspectedPath).toBeNull()
  })

  it('the whole state survives a JSON round trip', () => {
    store().setStatus(REPO, status({ branch: 'feature/auth', ahead: 2 }))
    const { status: value, inspectedPath } = store()

    expect(JSON.parse(JSON.stringify({ value, inspectedPath }))).toEqual({ value, inspectedPath })
  })
})
