import { useState } from 'react'
import { GitStatusBar } from '../features/git/public'
import { PortsModalHost } from '../features/ports/public'
import { SettingsPanel } from '../features/settings/public'
import { TerminalDeck } from '../features/terminal/public'
import { UpdateBanner } from '../features/updates/public'
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
  // Explorer open-path requests wait for restore, so a restored terminal at
  // the same path is focused rather than duplicated (Phase 18).
  const [restoreSettled, setRestoreSettled] = useState(false)

  return (
    <div className="app">
      <main className="app-shell">
        <ActivityRail activeSection={activeSection} onSelect={setActiveSection} />
        <div className="app-shell__content">
          <TerminalDeck openPathReady={restoreSettled} />
          <aside className="tool-drawer" hidden={activeSection === 'terminals'}>
            <div className="tool-drawer__panel" hidden={activeSection !== 'workspaces'}>
              <WorkspacePanel
                onWorkspaceOpened={() => setActiveSection('terminals')}
                onRestoreSettled={() => setRestoreSettled(true)}
              />
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
      <UpdateBanner />
      {/* App-owned, overlaying the status bar's right end: the git feature
          stays deletable without taking the version display with it. */}
      <span className="app-version">v{__APP_VERSION__}</span>
    </div>
  )
}
