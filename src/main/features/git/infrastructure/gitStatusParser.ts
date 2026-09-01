import { GitOutputError } from '../domain/errors'
import type { GitStatusCounts } from '../domain/GitRepositoryStatus'

/**
 * Parses `git status --porcelain=v2 --branch`.
 *
 * Porcelain v2 is chosen precisely because it is a stable, documented format —
 * v1 is explicitly not. Only the fields this app displays are read; paths are
 * counted, never interpreted, which is why C-quoted and non-ASCII filenames
 * need no special handling.
 *
 *   # branch.head <name> | (detached)
 *   # branch.ab +<ahead> -<behind>
 *   1 <XY> ...            ordinary change
 *   2 <XY> ...            renamed or copied
 *   u <XY> ...            unmerged
 *   ? <path>              untracked
 *   ! <path>              ignored
 *
 * `X` is the index status and `Y` the worktree status; `.` means unchanged. A
 * file can be both, which is why `staged` and `modified` are counted
 * independently rather than as a partition.
 */

const AHEAD_BEHIND = /^\+(\d+) -(\d+)$/

const invalid: (reason: string) => never = (reason) => {
  throw new GitOutputError(reason)
}

const parseHeader = (
  line: string,
  state: { branch: string | null; ahead: number; behind: number }
): void => {
  const [, key, ...rest] = line.split(' ')
  const value = rest.join(' ')

  if (key === 'branch.head') {
    // A detached HEAD has no branch name; git says so literally.
    state.branch = value === '(detached)' || value === '' ? null : value
    return
  }

  if (key === 'branch.ab') {
    const match = AHEAD_BEHIND.exec(value)
    if (!match) invalid(`branch.ab is not "+N -M" but "${value}"`)
    state.ahead = Number(match[1])
    state.behind = Number(match[2])
  }
  // branch.oid and branch.upstream carry nothing this app displays, and an
  // unknown header from a future git is not a reason to fail.
}

export const parseGitStatus = (output: string): GitStatusCounts => {
  const state = { branch: null as string | null, ahead: 0, behind: 0 }
  let staged = 0
  let modified = 0
  let untracked = 0
  let conflicted = 0

  for (const raw of output.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line === '') continue

    if (line.startsWith('# ')) {
      parseHeader(line, state)
      continue
    }

    const kind = line[0]

    if (kind === '?') {
      untracked += 1
      continue
    }

    // Ignored entries only appear with --ignored, which this app never passes.
    if (kind === '!') continue

    if (kind === '1' || kind === '2' || kind === 'u') {
      // A truncated line still starts with a known marker, so the length check
      // is what stops half a file being counted as a whole change.
      const xy = line.split(' ')[1]
      if (xy === undefined || xy.length !== 2) {
        invalid(`a "${kind}" entry is missing its status field`)
      }

      if (kind === 'u') {
        conflicted += 1
        continue
      }

      if (xy[0] !== '.') staged += 1
      if (xy[1] !== '.') modified += 1
      continue
    }

    invalid(`unrecognised line starting with "${kind}"`)
  }

  return {
    branch: state.branch,
    ahead: state.ahead,
    behind: state.behind,
    staged,
    modified,
    untracked,
    conflicted,
    isClean: staged + modified + untracked + conflicted === 0
  }
}
