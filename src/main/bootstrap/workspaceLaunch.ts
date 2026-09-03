import { isWorkspaceId } from '@shared/contracts/workspace'
import type { Logger } from './logger'

/**
 * The `--open-workspace=<id>` launch argument (Phase 19 — workspace
 * shortcuts). Mirrors `openPath.ts`: the same argument arrives from this
 * process's argv at a cold start and from a second instance's forwarded
 * argv, both validated identically — a well-formed id naming a workspace
 * that exists — and anything else logged and dropped. One id is queued; the
 * renderer pulls it exactly once after restore settles.
 */
export const OPEN_WORKSPACE_FLAG = '--open-workspace'

export interface WorkspaceLaunchService {
  /** Validates argv and queues the workspace id. Returns it, or null. */
  accept(argv: readonly string[]): string | null
  /** The queued id, once; null afterwards and when none was queued. */
  takePending(): string | null
}

export interface WorkspaceLaunchServiceOptions {
  readonly logger: Logger
  /** True when the workspace can actually be loaded. */
  readonly workspaceExists: (workspaceId: string) => boolean
}

const parseFlag = (argv: readonly string[]): string | null => {
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i]
    // A present flag with no value falls through to validation's warn.
    if (argument === OPEN_WORKSPACE_FLAG) return argv[i + 1] ?? ''
    if (argument?.startsWith(`${OPEN_WORKSPACE_FLAG}=`)) {
      return argument.slice(OPEN_WORKSPACE_FLAG.length + 1)
    }
  }
  return null
}

export const createWorkspaceLaunchService = ({
  logger,
  workspaceExists
}: WorkspaceLaunchServiceOptions): WorkspaceLaunchService => {
  let pending: string | null = null

  return {
    accept: (argv) => {
      const raw = parseFlag(argv)
      if (raw === null) return null

      if (!isWorkspaceId(raw)) {
        logger.warn('ignoring --open-workspace that is not a workspace id', { raw })
        return null
      }
      if (!workspaceExists(raw)) {
        // The shortcut outlived its workspace. Dropping it here keeps launch
        // quiet; the renderer path reports a missing workspace with a toast
        // when the id fails at open time instead.
        logger.warn('ignoring --open-workspace for a workspace that no longer exists', {
          workspaceId: raw
        })
        return null
      }

      pending = raw
      return raw
    },

    takePending: () => {
      const workspaceId = pending
      pending = null
      return workspaceId
    }
  }
}
