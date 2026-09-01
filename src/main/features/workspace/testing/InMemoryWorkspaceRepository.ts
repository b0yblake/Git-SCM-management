import { WorkspaceNotFoundError } from '../domain/errors'
import type { Workspace } from '../domain/Workspace'
import type { WorkspaceRepository } from '../domain/WorkspaceRepository'

export interface InMemoryWorkspaceRepository extends WorkspaceRepository {
  /** Every workspace handed to `save`, in order. */
  readonly saves: Workspace[]
  /** Puts a workspace in the store without going through `save`. */
  seed(workspace: Workspace): void
  /** Makes the next `get` for this id behave like an unreadable file. */
  corrupt(id: string): void
}

/**
 * Same contract as `JsonWorkspaceRepository`, no filesystem.
 *
 * Values are cloned on the way in and out, so a test cannot accidentally pass
 * because the service and the store share an object — and a non-serializable
 * value (a PTY handle, a function) throws here exactly as it would on disk.
 */
export const createInMemoryWorkspaceRepository = (): InMemoryWorkspaceRepository => {
  const stored = new Map<string, Workspace>()
  const unreadable = new Set<string>()
  const saves: Workspace[] = []

  const read = (id: string): Workspace => {
    if (unreadable.has(id)) throw new Error('unreadable workspace')
    const workspace = stored.get(id)
    if (!workspace) throw new WorkspaceNotFoundError(id)
    return structuredClone(workspace)
  }

  return {
    saves,

    seed: (workspace) => {
      stored.set(workspace.id, structuredClone(workspace))
    },

    corrupt: (id) => {
      unreadable.add(id)
    },

    list: () => [...stored.keys()].filter((id) => !unreadable.has(id)).map(read),

    get: read,

    save: (workspace) => {
      const copy = structuredClone(workspace)
      stored.set(copy.id, copy)
      unreadable.delete(copy.id)
      saves.push(copy)
    },

    delete: (id) => {
      stored.delete(id)
      unreadable.delete(id)
    }
  }
}
