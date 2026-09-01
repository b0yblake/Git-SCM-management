import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { GitOutputError } from '../domain/errors'
import { createGitCliAdapter, type GitRunner } from './GitCliAdapter'

const FEATURE = resolve(import.meta.dirname, '..')

const runner = (result: { ok: boolean; stdout: string }) =>
  vi.fn<GitRunner>().mockResolvedValue(result)

describe('the arguments it builds', () => {
  it('asks for the repository root in the directory it was given', async () => {
    const run = runner({ ok: true, stdout: 'D:/Projects/app\n' })

    await createGitCliAdapter({ run }).repositoryRoot('D:/Projects/app/src')

    expect(run).toHaveBeenCalledExactlyOnceWith(
      ['rev-parse', '--show-toplevel'],
      'D:/Projects/app/src'
    )
  })

  it('asks for status in porcelain v2, with the branch header', async () => {
    const run = runner({ ok: true, stdout: '# branch.head main\n' })

    await createGitCliAdapter({ run }).status('D:/Projects/app')

    expect(run).toHaveBeenCalledExactlyOnceWith(
      ['status', '--porcelain=v2', '--branch'],
      'D:/Projects/app'
    )
  })

  it('trims the newline git puts after the root', async () => {
    const run = runner({ ok: true, stdout: 'D:/Projects/app\n' })

    await expect(createGitCliAdapter({ run }).repositoryRoot('D:/x')).resolves.toBe(
      'D:/Projects/app'
    )
  })
})

describe('how it reads a non-zero exit', () => {
  /** Outside a repository git exits non-zero; that is an answer, not a fault. */
  it('reports no repository rather than failing', async () => {
    const run = runner({ ok: false, stdout: '' })

    await expect(createGitCliAdapter({ run }).repositoryRoot('C:/Users/dev')).resolves.toBeNull()
  })

  it('refuses to parse a status that git itself rejected', async () => {
    const run = runner({ ok: false, stdout: 'anything at all' })

    await expect(createGitCliAdapter({ run }).status('D:/Projects/app')).rejects.toThrow(
      GitOutputError
    )
  })

  it('reports no repository when the root comes back empty', async () => {
    const run = runner({ ok: true, stdout: '\n' })

    await expect(createGitCliAdapter({ run }).repositoryRoot('C:/x')).resolves.toBeNull()
  })
})

/**
 * The hard scope limit of Phase 9, enforced rather than trusted: this feature
 * may only read. A write verb would have to be constructed as a string
 * somewhere in here first.
 */
describe('read-only, by scan', () => {
  const WRITE_VERBS =
    /['"`](commit|push|pull|fetch|rebase|merge|reset|checkout|stash|clean|apply|revert|cherry-pick|tag|remote|config)['"`]/

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return entry.name.endsWith('.ts') && !entry.name.includes('.spec.') ? [path] : []
    })

  const files = sourceFiles(FEATURE)

  it('scans a meaningful number of files', () => {
    // Guards the guard: a broken walk would make the test below vacuous.
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  it('recognises a write verb when it sees one', () => {
    // Proves the pattern classifies, rather than never matching anything.
    expect(WRITE_VERBS.test("run(['commit', '-m', 'x'], cwd)")).toBe(true)
    expect(WRITE_VERBS.test("run(['status', '--porcelain=v2'], cwd)")).toBe(false)
  })

  it('constructs no git argument that could change a repository', () => {
    const offenders = files
      .filter((file) => WRITE_VERBS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(FEATURE, file).split(sep).join('/'))

    expect(offenders).toEqual([])
  })
})
