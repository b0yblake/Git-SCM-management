import { useCallback, useState } from 'react'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { useAppSettings } from '../../settings/public'
import { useShellProfiles } from '../hooks/useShellProfiles'
import { useTerminalShortcuts } from '../hooks/useTerminalShortcuts'
import { useTerminalSessions } from '../hooks/useTerminalSessions'
import { useTerminalStore } from '../store/terminalStore'
import { TerminalLayoutToolbar } from './TerminalLayoutToolbar'
import { TerminalNavigator } from './TerminalNavigator'
import { TerminalPane } from './TerminalPane'

/**
 * Owns the renderer-only Terminal Deck. Every TerminalView stays mounted for
 * its session; layout only changes which pane wrappers are CSS-visible.
 */
export const TerminalDeck = (): React.JSX.Element => {
  const [renameRequestId, setRenameRequestId] = useState<string | null>(null)
  const sessions = useTerminalStore((state) => state.sessions)
  const order = useTerminalStore((state) => state.order)
  const activeSessionId = useTerminalStore((state) => state.activeSessionId)
  const visibleSessionIds = useTerminalStore((state) => state.visibleSessionIds)
  const layoutMode = useTerminalStore((state) => state.layoutMode)
  const setActive = useTerminalStore((state) => state.setActive)
  const hideSession = useTerminalStore((state) => state.hideSession)
  const setLayoutMode = useTerminalStore((state) => state.setLayoutMode)
  const renameSession = useTerminalStore((state) => state.renameSession)

  const { settings } = useAppSettings()
  const shells = useShellProfiles()
  const controller = useTerminalSessions({
    confirmBeforeClosingRunningTerminal: settings.confirmBeforeClosingRunningTerminal
  })

  const { openTerminal, closeActiveTerminal } = controller
  useTerminalShortcuts({
    onCreate: useCallback(() => void openTerminal(), [openTerminal]),
    onCloseActive: useCallback(() => void closeActiveTerminal(), [closeActiveTerminal]),
    onNext: controller.activateNext,
    onPrevious: controller.activatePrevious
  })

  const terminals = order.flatMap((id) => {
    const session = sessions[id]
    return session ? [session] : []
  })
  const shellLabels = new Map(shells.profiles.map((profile) => [profile.id, profile.label]))

  return (
    <div className="terminal-deck">
      <TerminalNavigator
        terminals={terminals}
        activeId={activeSessionId}
        visibleIds={visibleSessionIds}
        layoutMode={layoutMode}
        profiles={shells.profiles}
        defaultShellProfileId={shells.defaultShellProfileId}
        renameRequestId={renameRequestId}
        onRenameRequestHandled={() => setRenameRequestId(null)}
        onActivate={setActive}
        onClose={(id) => void controller.closeTerminal(id)}
        onRename={renameSession}
        onCreate={() => void controller.openTerminal()}
        onCreateWithProfile={(id) => {
          void shells.setDefault(id)
          void controller.openTerminal(id)
        }}
      />

      <main className="terminal-mosaic" aria-label="Terminal mosaic">
        <TerminalLayoutToolbar
          mode={layoutMode}
          visibleCount={visibleSessionIds.length}
          onChange={setLayoutMode}
        />

        <div className={`terminal-mosaic__canvas terminal-mosaic__canvas--${layoutMode}`}>
          {terminals.length === 0 && (
            <div className="terminal-mosaic__empty" role="status">
              <strong>
                {controller.isOpening ? 'Opening a terminal…' : 'No terminals running'}
              </strong>
              {!controller.isOpening && (
                <>
                  <span>Create a shell to start working.</span>
                  <button type="button" onClick={() => void controller.openTerminal()}>
                    New terminal
                  </button>
                </>
              )}
            </div>
          )}

          {terminals.length > 0 && visibleSessionIds.length === 0 && (
            <div className="terminal-mosaic__empty" role="status">
              <strong>All terminals are parked</strong>
              <span>Select one from the Navigator or restore the first session.</span>
              <button type="button" onClick={() => order[0] && setActive(order[0])}>
                Show first terminal
              </button>
            </div>
          )}

          {terminals.map((session) => {
            const paneIndex = visibleSessionIds.indexOf(session.id)
            const isVisible = paneIndex >= 0
            return (
              <div
                key={session.id}
                className="terminal-mosaic__slot"
                data-testid={`panel-${session.id}`}
                hidden={!isVisible}
                style={{ order: isVisible ? paneIndex : undefined }}
              >
                <TerminalPane
                  session={session}
                  paneNumber={paneIndex + 1}
                  shellLabel={
                    shellLabels.get(session.definition.shellProfileId) ??
                    session.definition.shellProfileId
                  }
                  isActive={session.id === activeSessionId}
                  isVisible={isVisible}
                  fontSize={settings.terminalFontSize}
                  cursorBlink={settings.terminalCursorBlink}
                  onActivate={() => setActive(session.id)}
                  onRename={() => setRenameRequestId(session.id)}
                  onDuplicate={() => void controller.duplicateTerminal(session.id)}
                  onPark={() => hideSession(session.id)}
                  onMaximize={() => {
                    setActive(session.id)
                    useTerminalStore.getState().setLayoutMode('focus')
                  }}
                  onClose={() => void controller.closeTerminal(session.id)}
                />
              </div>
            )
          })}
        </div>
      </main>

      {controller.pendingClose && (
        <ConfirmDialog
          title={`Close "${controller.pendingClose.title}"?`}
          description="Its shell process is still running and closing will end it. To keep it running in the background, park the terminal instead."
          confirmLabel="Close terminal"
          danger
          onConfirm={() => void controller.confirmPendingClose()}
          onCancel={controller.cancelPendingClose}
        />
      )}
    </div>
  )
}
