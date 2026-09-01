import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitOutputError } from '../domain/errors'
import { parseGitStatus } from './gitStatusParser'

/**
 * Fixture-driven on purpose: every input below was captured from a real
 * repository once, so this suite passes on a machine with no git installed
 * (TESTING.md §5, and the Phase 9 Definition of Done).
 */
const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/git')

const fixture = (name: string): string => readFileSync(join(FIXTURES, `${name}.txt`), 'utf8')

const parse = (name: string) => parseGitStatus(fixture(name))

describe('the fixtures themselves', () => {
  it('are all present, so a missing file fails loudly rather than silently', () => {
    expect(readdirSync(FIXTURES).sort()).toEqual([
      'ahead-behind.txt',
      'awkward-names.txt',
      'bad-ahead-behind.txt',
      'clean.txt',
      'conflicted.txt',
      'detached.txt',
      'dirty.txt',
      'empty.txt',
      'fresh.txt',
      'renamed.txt',
      'staged-and-modified.txt',
      'truncated.txt'
    ])
  })
})

describe('a clean repository', () => {
  it('reports clean with every count at zero', () => {
    expect(parse('clean')).toEqual({
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

  it('treats empty output as clean rather than as a parse error', () => {
    expect(parseGitStatus('')).toEqual({
      branch: null,
      ahead: 0,
      behind: 0,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
      isClean: true
    })
  })
})

describe('counting changes', () => {
  it('counts three modified and one untracked exactly', () => {
    const status = parse('dirty')

    expect(status.modified).toBe(3)
    expect(status.untracked).toBe(1)
    expect(status.staged).toBe(0)
    expect(status.isClean).toBe(false)
  })

  /** A file can be in both states at once; they are not a partition. */
  it('counts a file that is both staged and modified in both', () => {
    const status = parse('staged-and-modified')

    expect(status.staged).toBe(1)
    expect(status.modified).toBe(1)
  })

  it('counts an unmerged entry as conflicted', () => {
    const status = parse('conflicted')

    expect(status.conflicted).toBe(1)
    expect(status.isClean).toBe(false)
  })

  it('counts renamed and copied entries by their index and worktree state', () => {
    // `2 R.` is a rename staged in the index; `1 A.` is the added copy.
    const status = parse('renamed')

    expect(status.staged).toBe(2)
    expect(status.modified).toBe(0)
    expect(status.untracked).toBe(0)
  })

  it('counts filenames with spaces and non-ASCII characters like any other', () => {
    // Git C-quotes those paths; the parser never reads a path, which is why it
    // does not have to unquote anything.
    const status = parse('awkward-names')

    expect(status.modified).toBe(2)
    expect(status.untracked).toBe(1)
  })
})

describe('the branch header', () => {
  it('reads ahead and behind', () => {
    const status = parse('ahead-behind')

    expect(status.branch).toBe('main')
    expect(status.ahead).toBe(2)
    expect(status.behind).toBe(1)
  })

  it('reports zero ahead and behind when there is no upstream', () => {
    const status = parse('clean')

    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
  })

  /** Documented rule: a detached HEAD has no branch name, so `branch` is null. */
  it('reports no branch on a detached HEAD', () => {
    expect(parse('detached').branch).toBeNull()
  })

  it('names the branch of a repository with no commits yet', () => {
    const status = parse('fresh')

    expect(status.branch).toBe('main')
    expect(status.untracked).toBe(1)
  })
})

/** "Never a wrong count" is the requirement — silence would be worse. */
describe('output that cannot be trusted', () => {
  it('rejects a truncated entry rather than counting the line before it', () => {
    expect(() => parse('truncated')).toThrow(GitOutputError)
  })

  it('rejects an ahead/behind header that is not two numbers', () => {
    expect(() => parse('bad-ahead-behind')).toThrow(/branch.ab/)
  })

  it('rejects a line whose type it does not recognise', () => {
    expect(() => parseGitStatus('# branch.head main\nX something')).toThrow(GitOutputError)
  })

  it('ignores an unknown header from a future git, which is not corruption', () => {
    const status = parseGitStatus('# branch.head main\n# branch.something new\n')

    expect(status.branch).toBe('main')
    expect(status.isClean).toBe(true)
  })

  it('tolerates CRLF line endings', () => {
    const status = parseGitStatus('# branch.head main\r\n? a.txt\r\n')

    expect(status.branch).toBe('main')
    expect(status.untracked).toBe(1)
  })
})
