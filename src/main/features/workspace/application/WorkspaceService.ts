import { createId } from '@shared/domain/ids'
import {
  parseWorkspace,
  toSummary,
  WORKSPACE_ID_PREFIX,
  WORKSPACE_VERSION,
  type Workspace,
  type WorkspaceInput,
  type WorkspaceSummary
} from '../domain/Workspace'
import type { WorkspaceRepository } from '../domain/WorkspaceRepository'

/**
 * The workspace feature's public use-case layer.
 *
 * It owns the two things a caller must not: identity and time. Everything else
 * is validation (in the domain) or storage (in the repository).
 */
export class WorkspaceService {
  readonly #repository: WorkspaceRepository

  constructor(repository: WorkspaceRepository) {
    this.#repository = repository
  }

  /** Summaries only — a sidebar has no use for every terminal definition. */
  list(): readonly WorkspaceSummary[] {
    return this.#repository.list().map(toSummary)
  }

  get(id: string): Workspace {
    return this.#repository.get(id)
  }

  /**
   * Creates when `input.id` is absent, overwrites when it is present.
   *
   * Timestamps are stamped here rather than accepted from the caller: a
   * renderer able to set `updatedAt` could make a stale workspace look newer
   * than the one that replaced it. `createdAt` is read back from the stored
   * copy so an overwrite never rewrites history.
   */
  save(input: WorkspaceInput): Workspace {
    const id = input.id ?? createId(WORKSPACE_ID_PREFIX)
    const now = Date.now()

    const workspace = parseWorkspace({
      ...input,
      id,
      version: WORKSPACE_VERSION,
      createdAt: this.#createdAt(id) ?? now,
      updatedAt: now
    })

    this.#repository.save(workspace)
    return workspace
  }

  delete(id: string): void {
    this.#repository.delete(id)
  }

  #createdAt(id: string): number | undefined {
    try {
      return this.#repository.get(id).createdAt
    } catch {
      // Nothing stored, or stored but unreadable — either way there is no
      // history worth keeping, and saving over a corrupt file must still work.
      return undefined
    }
  }
}
