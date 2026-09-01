import { useGitStatus } from '../hooks/useGitStatus'
import { useGitStore } from '../store/gitStore'
import { GitStatusBadge } from './GitStatusBadge'

/** Wires the git feature; the badge below it stays presentational. */
export const GitStatusBar = (): React.JSX.Element => {
  useGitStatus()
  const status = useGitStore((state) => state.status)

  return (
    <footer className="status-bar">
      <GitStatusBadge status={status} />
    </footer>
  )
}
