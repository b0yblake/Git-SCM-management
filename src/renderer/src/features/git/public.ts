// Public surface of the renderer git feature (ARCHITECTURE.md §4).
// Nothing outside this feature may import it except the app shell — Git is
// additive metadata, and removing it must leave the app working.
export { GitStatusBar } from './components/GitStatusBar'
export { GitStatusBadge, type GitStatusBadgeProps } from './components/GitStatusBadge'
export { useGitStatus, GIT_POLL_MS } from './hooks/useGitStatus'
export { useGitStore, type GitUiState } from './store/gitStore'
