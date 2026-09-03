import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { isWorkspaceId } from '@shared/contracts/workspace'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from './ipcPorts'
import type { Logger } from './logger'
import { OPEN_WORKSPACE_FLAG } from './workspaceLaunch'
import type { WorkspaceLaunchService } from './workspaceLaunch'

/** What `shell.writeShortcutLink` needs, composed pure so tests can pin it. */
export interface ShortcutDefinition {
  readonly target: string
  readonly args: string
  readonly icon: string
  readonly iconIndex: number
  readonly description: string
}

/** Windows filenames cannot carry these; the workspace name may. */
export const sanitizeShortcutName = (name: string): string => {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : 'Workspace'
}

export const shortcutDefinition = (
  exePath: string,
  workspaceId: string,
  workspaceName: string
): ShortcutDefinition => ({
  target: exePath,
  // The `=` form on purpose — it survives Chromium's argv rebuild when the
  // shortcut lands on an already-running instance (the Phase 18 lesson).
  args: `${OPEN_WORKSPACE_FLAG}=${workspaceId}`,
  icon: exePath,
  iconIndex: 0,
  description: `Open workspace "${workspaceName}" in GitDeck`
})

export interface WorkspaceLaunchIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly launch: WorkspaceLaunchService
  /** Loads the workspace's display name, or null when it does not exist. */
  readonly workspaceName: (workspaceId: string) => string | null
  /**
   * The native save dialog, seeded with `<sanitized name>.lnk` on the
   * desktop. Resolves to the chosen path, or null on cancel — the renderer
   * never supplies one.
   */
  readonly pickSavePath: (defaultFileName: string) => Promise<string | null>
  /** `shell.writeShortcutLink`; answers whether the write landed. */
  readonly writeShortcut: (shortcutPath: string, definition: ShortcutDefinition) => boolean
  readonly exePath: string
  readonly logger: Logger
}

const parseWorkspaceIdPayload = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  if (Object.keys(record).length !== 1) return null
  const workspaceId = record['workspaceId']
  return isWorkspaceId(workspaceId) ? workspaceId : null
}

/**
 * Workspace shortcuts (Phase 19), bootstrap-owned like the Phase 18 queue.
 * `shortcut` is the only channel in the app that creates a file outside the
 * data root — and only ever at the path the save dialog answered with.
 */
export const registerWorkspaceLaunchIpc = ({
  registry,
  launch,
  workspaceName,
  pickSavePath,
  writeShortcut,
  exePath,
  logger
}: WorkspaceLaunchIpcDependencies): void => {
  registry.handle(IPC.workspace.pendingOpen, (payload): Result<string | null, IpcError> => {
    if (payload !== undefined) {
      return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'pendingopen takes no payload' })
    }
    return Ok(launch.takePending())
  })

  registry.handle(
    IPC.workspace.shortcut,
    async (payload): Promise<Result<{ path: string } | null, IpcError>> => {
      const workspaceId = parseWorkspaceIdPayload(payload)
      if (workspaceId === null) {
        return Err({
          code: IPC_ERROR_CODES.invalidRequest,
          message: 'shortcut takes exactly { workspaceId }'
        })
      }

      const name = workspaceName(workspaceId)
      if (name === null) {
        return Err({ code: IPC_ERROR_CODES.invalidRequest, message: 'no such workspace' })
      }

      const chosen = await pickSavePath(`${sanitizeShortcutName(name)}.lnk`)
      if (chosen === null) return Ok(null)

      const path = chosen.toLowerCase().endsWith('.lnk') ? chosen : `${chosen}.lnk`
      const written = writeShortcut(path, shortcutDefinition(exePath, workspaceId, name))
      if (!written) {
        logger.warn('failed to write workspace shortcut', { path, workspaceId })
        return Err({ code: IPC_ERROR_CODES.internal, message: 'could not write the shortcut' })
      }

      logger.info('workspace shortcut created', { path, workspaceId })
      return Ok({ path })
    }
  )
}
