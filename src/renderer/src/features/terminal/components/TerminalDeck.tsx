import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { useAppSettings } from '../../settings/public'
import { computeGridTemplate } from '../model/gridLayout'
import { useOpenPath } from '../hooks/useOpenPath'
import { useShellProfiles } from '../hooks/useShellProfiles'
import { useTerminalShortcuts } from '../hooks/useTerminalShortcuts'
import { useTerminalSessions } from '../hooks/useTerminalSessions'
import { TERMINAL_LAYOUT_CAPACITY, useTerminalStore } from '../store/terminalStore'
import { TerminalLayoutToolbar } from './TerminalLayoutToolbar'
import { TerminalNavigator } from './TerminalNavigator'
import { TerminalPane } from './TerminalPane'

export interface TerminalDeckProps {
  /**
   * Explorer open-path requests hold until session restore settles
   * (Phase 18). Defaults to true so a deck without restore acts immediately.
   */
  readonly openPathReady?: boolean
}

/**
 * Owns the renderer-only Terminal Deck. Every TerminalView stays mounted for
 * its session; layout only changes which pane wrappers are CSS-visible.
 */
export const TerminalDeck = ({ openPathReady = true }: TerminalDeckProps = {}): React.JSX.Element => {
  const [renameRequestId, setRenameRequestId] = useState<string | null>(null)
  const sessions = useTerminalStore((state) => state.sessions)
  const order = useTerminalStore((state) => state.order)
  const activeSessionId = useTerminalStore((state) => state.activeSessionId)
  const visibleSessionIds = useTerminalStore((state) => state.visibleSessionIds)
  const layoutMode = useTerminalStore((state) => state.layoutMode)
  const lastExpandedLayoutMode = useTerminalStore((state) => state.lastExpandedLayoutMode)
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
  useOpenPath({ enabled: openPathReady, openAt: controller.openTerminalAt })
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

  // Phase 20 — exactly one inviting slot in the next empty pane. Focus has no
  // empty pane worth inviting into, and the zero/all-parked states already
  // carry their own action, so the placeholder stays out of their way.
  // Grid's capacity is Infinity (Phase 21), which makes the slot its
  // permanent last cell.
  const showAddSlot =
    layoutMode !== 'focus' &&
    visibleSessionIds.length > 0 &&
    visibleSessionIds.length < TERMINAL_LAYOUT_CAPACITY[layoutMode]

  // Phase 21 — the elastic Grid lattice follows the measured canvas, so
  // every terminal shares the one page in near-16:9 cells.
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const measure = (): void => {
      const rect = canvas.getBoundingClientRect()
      setCanvasSize((size) =>
        size.width === rect.width && size.height === rect.height
          ? size
          : { width: rect.width, height: rect.height }
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    measure()
    return () => observer.disconnect()
  }, [])

  const gridTemplate =
    layoutMode === 'grid' && visibleSessionIds.length > 0
      ? computeGridTemplate(
          visibleSessionIds.length + (showAddSlot ? 1 : 0),
          canvasSize.width,
          canvasSize.height
        )
      : null

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

        <div
          ref={canvasRef}
          className={`terminal-mosaic__canvas terminal-mosaic__canvas--${layoutMode}`}
          style={
            gridTemplate
              ? {
                  gridTemplateColumns: `repeat(${gridTemplate.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridTemplate.rows}, minmax(0, 1fr))`
                }
              : undefined
          }
        >
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
                  isMaximized={layoutMode === 'focus'}
                  fontSize={settings.terminalFontSize}
                  cursorBlink={settings.terminalCursorBlink}
                  onActivate={() => setActive(session.id)}
                  onRename={() => setRenameRequestId(session.id)}
                  onDuplicate={() => void controller.duplicateTerminal(session.id)}
                  onPark={() => hideSession(session.id)}
                  onToggleMaximize={() => {
                    if (layoutMode === 'focus') {
                      setLayoutMode(lastExpandedLayoutMode)
                      return
                    }
                    setActive(session.id)
                    setLayoutMode('focus')
                  }}
                  onClose={() => void controller.closeTerminal(session.id)}
                />
              </div>
            )
          })}

          {showAddSlot && (
            <div
              className="terminal-mosaic__slot terminal-mosaic__slot--add"
              style={{ order: visibleSessionIds.length }}
            >
              <button
                type="button"
                className="terminal-mosaic__add"
                disabled={controller.isOpening}
                onClick={() => void controller.openTerminal()}
              >
                <span className="terminal-mosaic__add-icon" aria-hidden="true">
                  +
                </span>
                Add new Terminal
              </button>
            </div>
          )}
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
