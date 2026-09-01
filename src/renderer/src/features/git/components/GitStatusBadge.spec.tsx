import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GitRepositoryStatus } from '@shared/contracts/git'
import {
  createFakeGitDeckApi,
  emptyCalls,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { GitStatusBadge } from './GitStatusBadge'

let api: FakeGitDeckApi

const status = (overrides: Partial<GitRepositoryStatus> = {}): GitRepositoryStatus => ({
  repositoryRoot: 'D:\\Projects\\app',
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

const badge = () => screen.queryByRole('status')

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('what it shows', () => {
  it('the branch and clean, for a clean repository', () => {
    render(<GitStatusBadge status={status()} />)

    expect(badge()?.textContent).toContain('main')
    expect(badge()?.textContent).toContain('clean')
  })

  it('the counts, for a dirty one', () => {
    render(<GitStatusBadge status={status({ modified: 3, untracked: 1, isClean: false })} />)

    expect(badge()?.textContent).toContain('3 modified')
    expect(badge()?.textContent).toContain('1 untracked')
    expect(badge()?.textContent).not.toContain('clean')
  })

  it('ahead and behind, when there is an upstream to be ahead of', () => {
    render(<GitStatusBadge status={status({ ahead: 2, behind: 1 })} />)

    expect(badge()?.textContent).toContain('↑2')
    expect(badge()?.textContent).toContain('↓1')
  })

  it('no arrows when the branch is level with its upstream', () => {
    render(<GitStatusBadge status={status()} />)

    expect(badge()?.textContent).not.toContain('↑')
    expect(badge()?.textContent).not.toContain('↓')
  })

  it('staged and conflicted counts', () => {
    render(<GitStatusBadge status={status({ staged: 2, conflicted: 1, isClean: false })} />)

    expect(badge()?.textContent).toContain('2 staged')
    expect(badge()?.textContent).toContain('1 conflicted')
  })

  it('"detached" when there is no branch name', () => {
    render(<GitStatusBadge status={status({ branch: null })} />)

    expect(badge()?.textContent).toContain('detached')
  })
})

/** The independence guarantee, at its most visible. */
describe('when there is nothing to show', () => {
  it('renders nothing at all — not an error, not a placeholder', () => {
    const { container } = render(<GitStatusBadge status={null} />)

    expect(badge()).toBeNull()
    expect(container.textContent).toBe('')
  })
})

describe('boundary', () => {
  it('renders without touching the bridge', () => {
    render(<GitStatusBadge status={status({ modified: 1, isClean: false })} />)

    expect(api.calls).toEqual(emptyCalls())
  })
})
