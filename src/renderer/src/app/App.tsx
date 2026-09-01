import { useState } from 'react'
import { GitStatusBar } from '../features/git/public'
import { PortsModalHost } from '../features/ports/public'
import { SettingsPanel } from '../features/settings/public'
import { TerminalDeck } from '../features/terminal/public'
import { WorkspacePanel } from '../features/workspace/public'
import { ToastHost } from '../shared/components/Toast'
import { ActivityRail, type AppSection } from './ActivityRail'

/**
 * The application shell.
 *
 * The Git status bar is the only place the Git feature is referenced. Deleting
 * that one line and the feature folder would leave everything else working,
 * which is the guarantee Phase 9 exists to keep.
 */
export const App = (): React.JSX.Element => {
  const [activeSection, setActiveSection] = useState<AppSection>('terminals')

  return (
    <div className="app">
      <main className="app-shell">
        <ActivityRail activeSection={activeSection} onSelect={setActiveSection} />
        <div className="app-shell__content">
          <TerminalDeck />
          <aside className="tool-drawer" hidden={activeSection === 'terminals'}>
            <div className="tool-drawer__panel" hidden={activeSection !== 'workspaces'}>
              <WorkspacePanel onWorkspaceOpened={() => setActiveSection('terminals')} />
            </div>
            <div className="tool-drawer__panel" hidden={activeSection !== 'settings'}>
              <SettingsPanel />
            </div>
          </aside>
        </div>
      </main>
      <GitStatusBar />
      <ToastHost />
      <PortsModalHost />
    </div>
  )
}
