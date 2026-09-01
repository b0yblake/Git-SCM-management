import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IpcError } from '@shared/contracts/ipc'
import type { Workspace, WorkspaceInput, WorkspaceSummary } from '@shared/contracts/workspace'
import { useToastStore } from '../../../shared/store/toastStore'
import { useWorkspaceStore } from '../store/workspaceStore'

export interface WorkspacesController {
  readonly summaries: readonly WorkspaceSummary[]
  readonly activeWorkspaceId: string | null
  readonly lastError: IpcError | null
  /** True until the first list has come back, so the sidebar can say so. */
  readonly isLoading: boolean
  readonly refresh: () => Promise<void>
  /** Resolves to the stored workspace, or null when the save was rejected. */
  readonly save: (input: WorkspaceInput) => Promise<Workspace | null>
  readonly load: (workspaceId: string) => Promise<Workspace | null>
  readonly remove: (workspaceId: string) => Promise<void>
}

/**
 * List, save and delete — the CRUD half of the workspace feature.
 *
 * The bridge is used here rather than in components, so a component test can
 * assert the bridge was never touched.
 */
export const useWorkspaces = (): WorkspacesController => {
  const summaries = useWorkspaceStore((state) => state.summaries)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const [lastError, setLastError] = useState<IpcError | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fail = useCallback((error: IpcError) => {
    setLastError(error)
    useToastStore.getState().push('error', error.message)
  }, [])

  const refresh = useCallback(async () => {
    const result = await window.gitdeck.workspace.list()
    if (result.ok) useWorkspaceStore.getState().setSummaries(result.value)
    else fail(result.error)
  }, [fail])

  // `activeWorkspaceId` in the store means "the workspace whose terminals are
  // open right now", which at mount is none. The persisted id is a restore
  // hint, and it is `useRestoreOnStartup` that acts on it — reading it here as
  // well would make `open()` think the workspace was already open and skip it.
  useEffect(() => {
    let cancelled = false

    void window.gitdeck.workspace.list().then((listed) => {
      if (cancelled) return
      if (listed.ok) useWorkspaceStore.getState().setSummaries(listed.value)
      else fail(listed.error)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [fail])

  const save = useCallback(
    async (input: WorkspaceInput) => {
      const result = await window.gitdeck.workspace.save(input)
      if (!result.ok) {
        fail(result.error)
        return null
      }
      setLastError(null)
      useWorkspaceStore
        .getState()
        .retainWorkspaceDefinitions(
          result.value.id,
          result.value.terminals.map((definition) => definition.id)
        )
      await refresh()
      return result.value
    },
    [refresh, fail]
  )

  const load = useCallback(
    async (workspaceId: string) => {
      const result = await window.gitdeck.workspace.get(workspaceId)
      if (!result.ok) {
        fail(result.error)
        return null
      }
      return result.value
    },
    [fail]
  )

  const remove = useCallback(
    async (workspaceId: string) => {
      const result = await window.gitdeck.workspace.delete(workspaceId)
      if (!result.ok) {
        fail(result.error)
        return
      }

      const store = useWorkspaceStore.getState()
      store.forgetWorkspace(workspaceId)
      // Deleting the open workspace leaves its terminals running — they are the
      // user's live work, and the definition is what was thrown away.
      if (store.activeWorkspaceId === workspaceId) {
        store.setActiveWorkspaceId(null)
        const remembered = await window.gitdeck.settings.update({
          activeWorkspaceId: null,
          activeTerminalDefinitionId: null
        })
        if (!remembered.ok) fail(remembered.error)
      }
      await refresh()
    },
    [refresh, fail]
  )

  return useMemo(
    () => ({ summaries, activeWorkspaceId, lastError, isLoading, refresh, save, load, remove }),
    [summaries, activeWorkspaceId, lastError, isLoading, refresh, save, load, remove]
  )
}
