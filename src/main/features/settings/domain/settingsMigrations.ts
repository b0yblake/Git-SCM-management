import type { StoreMigration } from '@main/bootstrap/migrations'

/**
 * Settings schema migrations (Phase 15).
 *
 * Empty on purpose: the store is at v1 and adding a defaulted field is not a
 * migration (`shared/contracts/settings.ts`). The first entry lands in the
 * phase that changes a field's meaning or shape — and that phase bumps
 * `SETTINGS_VERSION` and this list in the same change.
 */
export const SETTINGS_MIGRATIONS: readonly StoreMigration[] = []
