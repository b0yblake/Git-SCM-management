import { execFile } from 'node:child_process'
import { GitNotAvailableError, GitOutputError, GitTimeoutError } from '../domain/errors'
import type { GitAdapter } from '../domain/GitAdapter'
import type { GitStatusCounts } from '../domain/GitRepositoryStatus'
import { parseGitStatus } from './gitStatusParser'

export interface GitRunResult {
  /** Whether git exited zero. A non-zero exit is an answer, not a crash. */
  readonly ok: boolean
  readonly stdout: string
}

/** Runs git. Injected so argument construction can be tested without git. */
export type GitRunner = (args: readonly string[], cwd: string) => Promise<GitRunResult>

export interface GitCliAdapterOptions {
  readonly timeoutMs?: number
  readonly run?: GitRunner
}

export const DEFAULT_TIMEOUT_MS = 5_000

/**
 * The only module in the application allowed to run `git`.
 *
 * Every argument list here is read-only. Write verbs — commit, push, pull,
 * rebase, merge, reset, config writes — are out of scope by construction and
 * belong in a separate feature module (BACKLOG.md → Git Actions).
 * `GitCliAdapter.spec.ts` scans this whole feature to keep that true.
 */
export const createGitRunner =
  (timeoutMs: number): GitRunner =>
  (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile(
        'git',
        [...args],
        // `windowsHide` stops a console window flashing on every poll.
        { cwd, timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
        (error, stdout) => {
          if (!error) {
            resolve({ ok: true, stdout })
            return
          }

          const failure = error as NodeJS.ErrnoException & { killed?: boolean }
          if (failure.code === 'ENOENT') {
            reject(new GitNotAvailableError())
            return
          }
          if (failure.killed) {
            reject(new GitTimeoutError(timeoutMs))
            return
          }

          // A non-zero exit is how git says "not a repository", which is a
          // normal answer the caller has to be able to see.
          resolve({ ok: false, stdout })
        }
      )
    })

export const createGitCliAdapter = ({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  run = createGitRunner(timeoutMs)
}: GitCliAdapterOptions = {}): GitAdapter => ({
  repositoryRoot: async (path: string): Promise<string | null> => {
    const result = await run(['rev-parse', '--show-toplevel'], path)
    // Non-zero here means "not inside a repository" — a normal result.
    return result.ok ? result.stdout.trim() || null : null
  },

  status: async (repositoryRoot: string): Promise<GitStatusCounts> => {
    const result = await run(['status', '--porcelain=v2', '--branch'], repositoryRoot)
    // Git ran and refused: that is unreadable output, not a missing binary,
    // and it must never be parsed as though it were a status.
    if (!result.ok) throw new GitOutputError(`git status exited non-zero in ${repositoryRoot}`)
    return parseGitStatus(result.stdout)
  }
})
