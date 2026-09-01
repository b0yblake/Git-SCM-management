import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitTimeoutError } from '../domain/errors'
import { createGitCliAdapter, createGitRunner } from './GitCliAdapter'

/** Runs the real git binary — that is the thing under test (TESTING.md §2). */
let directory: string

const git = (...args: string[]): void => {
  execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
}

const adapter = createGitCliAdapter()

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitdeck-git-'))
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('against a real repository', () => {
  it('finds the root from a nested subdirectory', async () => {
    mkdirSync(join(directory, 'src', 'features'), { recursive: true })

    const root = await adapter.repositoryRoot(join(directory, 'src', 'features'))

    // Git answers with forward slashes even on Windows.
    expect(root?.toLowerCase().replace(/\//g, '\\')).toContain('gitdeck-git-')
  })

  it('reports a fresh repository as clean on its initial branch', async () => {
    writeFileSync(join(directory, 'a.txt'), 'a', 'utf8')
    git('add', '-A')
    git('commit', '-qm', 'one')

    const status = await adapter.status(directory)

    expect(status).toEqual({
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
      isClean: true
    })
  })

  it('counts a real modification and a real untracked file', async () => {
    writeFileSync(join(directory, 'a.txt'), 'a', 'utf8')
    git('add', '-A')
    git('commit', '-qm', 'one')
    writeFileSync(join(directory, 'a.txt'), 'changed', 'utf8')
    writeFileSync(join(directory, 'b.txt'), 'new', 'utf8')

    const status = await adapter.status(directory)

    expect(status.modified).toBe(1)
    expect(status.untracked).toBe(1)
    expect(status.isClean).toBe(false)
  })
})

describe('outside a repository', () => {
  it('answers null rather than failing', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'gitdeck-plain-'))

    try {
      await expect(adapter.repositoryRoot(plain)).resolves.toBeNull()
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})

describe('a git that does not finish', () => {
  /**
   * `--help` on a pager-less invocation still writes a lot and exits quickly,
   * so the hang is produced with a command that waits on stdin instead. What
   * matters is that the timeout fires and the process is killed rather than
   * left behind.
   */
  it('is killed once the timeout passes', async () => {
    const run = createGitRunner(200)

    await expect(run(['hash-object', '--stdin'], directory)).rejects.toThrow(GitTimeoutError)
  }, 15_000)
})
