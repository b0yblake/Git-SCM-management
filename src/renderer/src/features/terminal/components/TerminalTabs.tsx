import { useCallback, useState } from 'react'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { useAppSettings } from '../../settings/public'
import { useTerminalShortcuts } from '../hooks/useTerminalShortcuts'
import { useShellProfiles } from '../hooks/useShellProfiles'
import { useTerminalTabs } from '../hooks/useTerminalTabs'
import { useTerminalStore } from '../store/terminalStore'
import { TerminalTabBar } from './TerminalTabBar'
import { TerminalView } from './TerminalView'

/**
 * Owns the multi-terminal layout.
 *
 * Every `TerminalView` stays mounted for the life of its session and inactive
 * ones are hidden with CSS. Unmounting them would dispose their xterm instance
 * and drop both the scrollback and the output arriving while hidden — the PTY
 * would survive, but the user's screen would not.
 */
export const TerminalTabs = (): React.JSX.Element => {
  const sessions = useTerminalStore((state) => state.sessions)
  const order = useTerminalStore((state) => state.order)
  const activeSessionId = useTerminalStore((state) => state.activeSessionId)
  const setActive = useTerminalStore((state) => state.setActive)
  const renameSession = useTerminalStore((state) => state.renameSession)

  const { settings } = useAppSettings()
  const tabs = useTerminalTabs({
    confirmBeforeClosingRunningTerminal: settings.confirmBeforeClosingRunningTerminal
  })
  const shells = useShellProfiles()
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const { openTerminal, closeActiveTerminal } = tabs

  useTerminalShortcuts({
    onCreate: useCallback(() => void openTerminal(), [openTerminal]),
    onCloseActive: useCallback(() => void closeActiveTerminal(), [closeActiveTerminal]),
    onNext: tabs.activateNext,
    onPrevious: tabs.activatePrevious
  })

  // What the window shows at launch — a restored workspace, or a single shell
  // — is decided by `useRestoreOnStartup` (Phase 8). Opening one here too would
  // race it and produce a stray tab.

  const terminals = order.flatMap((id) => {
    const session = sessions[id]
    return session ? [session] : []
  })

  return (
    <div className="terminal-tabs">
      <TerminalTabBar
        terminals={terminals}
        activeId={activeSessionId}
        onActivate={setActive}
        onClose={(id) => void tabs.closeTerminal(id)}
        onRename={renameSession}
        onCreate={() => void tabs.openTerminal()}
        onCreateWithProfile={(id) => {
          void shells.setDefault(id)
          void tabs.openTerminal(id)
        }}
        profiles={shells.profiles}
        defaultShellProfileId={shells.defaultShellProfileId}
        renamingId={renamingId}
        onRenamingChange={setRenamingId}
      />

      <div className="terminal-tabs__panels">
        {terminals.length === 0 && (
          <div className="empty-state" role="status">
            <p className="empty-state__title">
              {tabs.isOpening ? 'Opening a terminal…' : 'No terminals open'}
            </p>
            {!tabs.isOpening && (
              <p className="empty-state__hint">
                Press <kbd>Ctrl</kbd>+<kbd>T</kbd>, or open a workspace from the sidebar.
              </p>
            )}
          </div>
        )}

        {terminals.map((session) => (
          <div
            key={session.id}
            className="terminal-tabs__panel"
            hidden={session.id !== activeSessionId}
            role="tabpanel"
            data-testid={`panel-${session.id}`}
          >
            <TerminalView
              sessionId={session.id}
              isActive={session.id === activeSessionId}
              fontSize={settings.terminalFontSize}
              cursorBlink={settings.terminalCursorBlink}
              onRename={() => setRenamingId(session.id)}
              onDuplicate={() => void tabs.duplicateTerminal(session.id)}
              onClose={() => void tabs.closeTerminal(session.id)}
            />
          </div>
        ))}
      </div>

      {tabs.pendingClose && (
        <ConfirmDialog
          title={`Close "${tabs.pendingClose.title}"? Its process is still running.`}
          confirmLabel="Close terminal"
          onConfirm={() => void tabs.confirmPendingClose()}
          onCancel={tabs.cancelPendingClose}
        />
      )}
    </div>
  )
}
