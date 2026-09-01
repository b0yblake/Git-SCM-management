import { join } from 'node:path'

/**
 * Every path GitDeck persists to, minted in one place (Phase 14).
 *
 * The composition root feeds in Electron's `userData` and `logs` directories;
 * tests feed in temp directories. No other module may join a storage filename
 * onto a directory — the storage layout table in ARCHITECTURE.md §15 is this
 * object, written down.
 */
export interface StoragePaths {
  readonly userDataDir: string
  /** Settings store — one JSON file. */
  readonly settingsFile: string
  /** Workspace store — one JSON file per workspace inside this directory. */
  readonly workspacesDir: string
  /** Storage manifest — bootstrap-owned bookkeeping, never seen by features. */
  readonly manifestFile: string
  /** Pre-migration originals (Phase 15): `settings.v<n>.json`. */
  readonly backupsDir: string
  /** Pre-migration workspace originals: `<workspace-id>.v<n>.json`. */
  readonly workspaceBackupsDir: string
  /** Rotating operational log. */
  readonly logFile: string
}

export const createStoragePaths = (userDataDir: string, logsDir: string): StoragePaths => ({
  userDataDir,
  settingsFile: join(userDataDir, 'settings.json'),
  workspacesDir: join(userDataDir, 'workspaces'),
  manifestFile: join(userDataDir, 'storage.json'),
  backupsDir: join(userDataDir, 'backups'),
  workspaceBackupsDir: join(userDataDir, 'backups', 'workspaces'),
  logFile: join(logsDir, 'gitdeck.log')
})
