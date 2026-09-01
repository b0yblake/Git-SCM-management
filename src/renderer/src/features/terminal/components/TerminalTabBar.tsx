import type {
  AvailableShellProfile,
  ShellProfileId,
  TerminalSessionInfo
} from '@shared/contracts/terminal'
import { NewTerminalMenu } from './NewTerminalMenu'
import { TerminalTab } from './TerminalTab'

export interface TerminalTabBarProps {
  readonly terminals: TerminalSessionInfo[]
  readonly activeId: string | null
  readonly onActivate: (sessionId: string) => void
  readonly onClose: (sessionId: string) => void
  readonly onRename: (sessionId: string, title: string) => void
  readonly onCreate: () => void
  readonly onCreateWithProfile: (id: ShellProfileId) => void
  readonly profiles: readonly AvailableShellProfile[]
  readonly defaultShellProfileId: ShellProfileId | null
  /** Which tab is being renamed, if any. Lifted so the context menu can set it. */
  readonly renamingId: string | null
  readonly onRenamingChange: (sessionId: string | null) => void
}

/**
 * Purely presentational (PLAN.md §16): it receives sessions and reports
 * intents. It must never call IPC — `TerminalTabBar.spec.tsx` asserts the
 * bridge records zero calls while it is driven.
 */
export const TerminalTabBar = ({
  terminals,
  activeId,
  onActivate,
  onClose,
  onRename,
  onCreate,
  onCreateWithProfile,
  profiles,
  defaultShellProfileId,
  renamingId,
  onRenamingChange
}: TerminalTabBarProps): React.JSX.Element => (
  <div className="terminal-tab-bar" role="tablist" aria-label="Terminals">
    {terminals.map((session) => (
      <TerminalTab
        key={session.id}
        session={session}
        isActive={session.id === activeId}
        isRenaming={session.id === renamingId}
        onActivate={onActivate}
        onClose={onClose}
        onRename={onRename}
        onRenamingChange={onRenamingChange}
      />
    ))}

    <NewTerminalMenu
      profiles={profiles}
      defaultShellProfileId={defaultShellProfileId}
      onCreate={onCreate}
      onCreateWithProfile={onCreateWithProfile}
    />
  </div>
)
