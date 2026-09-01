import type { GitRepositoryStatus } from '@shared/contracts/git'

export interface GitStatusBadgeProps {
  readonly status: GitRepositoryStatus | null
}

const counts = (status: GitRepositoryStatus): string[] => {
  const parts: string[] = []
  if (status.staged > 0) parts.push(`${status.staged} staged`)
  if (status.modified > 0) parts.push(`${status.modified} modified`)
  if (status.untracked > 0) parts.push(`${status.untracked} untracked`)
  if (status.conflicted > 0) parts.push(`${status.conflicted} conflicted`)
  return parts
}

/**
 * Purely presentational, and absent by design when there is nothing to show.
 *
 * Rendering nothing — rather than "no repository" or an error — is what makes
 * an uninstalled git invisible instead of noisy.
 */
export const GitStatusBadge = ({ status }: GitStatusBadgeProps): React.JSX.Element | null => {
  if (!status) return null

  const changes = counts(status)

  return (
    <div className="git-badge" role="status" aria-label="Repository status">
      <span className="git-badge__branch">{status.branch ?? 'detached'}</span>

      {(status.ahead > 0 || status.behind > 0) && (
        <span className="git-badge__ab">
          {status.ahead > 0 && `↑${status.ahead}`}
          {status.behind > 0 && `↓${status.behind}`}
        </span>
      )}

      {changes.length === 0 ? (
        <span className="git-badge__clean">clean</span>
      ) : (
        <span className="git-badge__dirty">{changes.join(' · ')}</span>
      )}
    </div>
  )
}
