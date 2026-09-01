import { GitStatusBar } from '../features/git/public'
import { PortsModalHost } from '../features/ports/public'
import { SettingsPanel } from '../features/settings/public'
import { TerminalTabs } from '../features/terminal/public'
import { WorkspacePanel } from '../features/workspace/public'
import { ToastHost } from '../shared/components/Toast'

/**
 * The application shell.
 *
 * The Git status bar is the only place the Git feature is referenced. Deleting
 * that one line and the feature folder would leave everything else working,
 * which is the guarantee Phase 9 exists to keep.
 */
export const App = (): React.JSX.Element => (
  <div className="app">
    <main className="app-shell">
      <div className="app-shell__side">
        <WorkspacePanel />
        <SettingsPanel />
      </div>
      <TerminalTabs />
    </main>
    <GitStatusBar />
    <ToastHost />
    <PortsModalHost />
  </div>
)
