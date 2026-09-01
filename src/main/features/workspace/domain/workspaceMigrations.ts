import type { StoreMigration } from '@main/bootstrap/migrations'

/**
 * Workspace schema migrations (Phase 15).
 *
 * Empty on purpose: the store is at v1. The phase that first changes the
 * workspace shape adds its step here, bumps `WORKSPACE_VERSION` and updates
 * `parseWorkspace` in the same change — the three are one unit.
 */
export const WORKSPACE_MIGRATIONS: readonly StoreMigration[] = []
