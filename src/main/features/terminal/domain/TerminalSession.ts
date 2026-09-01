/**
 * The serializable terminal models live in `@shared/contracts/terminal` because
 * the renderer needs them and may not import Main-process code. They are
 * re-exported here so the rest of the feature keeps importing from its own
 * domain folder.
 */
export type {
  ShellProfileId,
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalDefinition,
  TerminalExitEvent,
  TerminalSessionInfo,
  TerminalSessionStatus
} from '@shared/contracts/terminal'

export { isShellProfileId, SHELL_PROFILE_IDS } from '@shared/contracts/terminal'

/** Terminal size in character cells. Main-side only — never crosses IPC. */
export interface TerminalSize {
  readonly cols: number
  readonly rows: number
}
