import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { app } from 'electron'
import { SETTINGS_VERSION } from '@shared/contracts/settings'
import { WORKSPACE_VERSION } from '@shared/contracts/workspace'
import { createGitService, type GitService } from '../features/git/public'
import { createPortService, type PortService } from '../features/ports/public'
import { createSettingsService, type SettingsService } from '../features/settings/public'
import {
  createShellRegistry,
  createTerminalService,
  detectInstalledShellProfiles,
  pickDefaultShellProfileId,
  type TerminalService
} from '../features/terminal/public'
import { createUpdateService, type UpdateService } from '../features/updates/public'
import { createWorkspaceService, type WorkspaceService } from '../features/workspace/public'
import { combineSinks, createFileSink } from './fileSink'
import {
  copyDataToNewRoot,
  resolveDataRoot,
  writeDataRootPointer,
  type DataRootResolution
} from './dataRoot'
import { consoleSink, createLogger, type Logger } from './logger'
import { patchManifest, readManifestTimestamp, recordRun } from './storageManifest'
import { createStoragePaths } from './storagePaths'

/**
 * Composition root. Feature services are constructed here and handed to the IPC
 * layer, so no module reaches for a global singleton.
 *
 * This is also where settings and the terminal meet: the terminal feature asks
 * "what is the default shell?" through a function, so it never imports the
 * settings feature and the user can change the answer while the app runs.
 */
export interface AppContainer {
  readonly logger: Logger
  readonly settings: SettingsService
  readonly terminal: TerminalService
  readonly workspace: WorkspaceService
  /** Additive metadata: nothing else in the container depends on it. */
  readonly git: GitService
  /** Port inspection and deliberate process termination (Phase 12). */
  readonly ports: PortService
  /** Startup release check — notify and link only, never download (Phase 16). */
  readonly updates: UpdateService
  /** Where data lives, and how a chosen switch is recorded (Phase 17). */
  readonly dataRoot: {
    readonly resolution: DataRootResolution
    /** Copies current data to the target and records the pointer. Throws. */
    readonly applySwitch: (target: string) => void
  }
}

/**
 * The composition root is where the filesystem is allowed in; the terminal
 * feature only ever sees this predicate.
 */
const directoryExists = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export const createContainer = (): AppContainer => {
  const defaultRoot = app.getPath('userData')
  const logsDir = app.getPath('logs')

  // The console sink is invisible in a packaged app, so production keeps a
  // file alongside it. `logs` is where Windows users and support already look.
  // The log path depends only on logsDir, so the logger can exist before the
  // data root is known — and the resolver below can log through it.
  const logger = createLogger(
    combineSinks(
      consoleSink,
      createFileSink({ filePath: createStoragePaths(defaultRoot, logsDir).logFile })
    )
  )

  // The user may have pointed data at another folder (Phase 17); everything
  // persisted below follows that choice. Paths are minted here and nowhere
  // else (Phase 14).
  const resolution = resolveDataRoot(defaultRoot, logger)
  const paths = createStoragePaths(resolution.dataRoot, logsDir)
  if (resolution.isCustom) logger.info('using custom data folder', { dataRoot: paths.userDataDir })
  const settings = createSettingsService(paths.settingsFile, paths.backupsDir, logger)
  const workspace = createWorkspaceService(paths.workspacesDir, paths.workspaceBackupsDir, logger)

  // Bookkeeping, not a feature: which app version ran, at which store schemas.
  recordRun({
    manifestFile: paths.manifestFile,
    appVersion: app.getVersion(),
    storeVersions: { settings: SETTINGS_VERSION, workspace: WORKSPACE_VERSION },
    logger
  })

  // Detected once at startup: a shell being installed mid-session is not worth
  // re-probing the filesystem on every terminal the user opens.
  const shells = createShellRegistry(detectInstalledShellProfiles(logger))

  const terminal = createTerminalService(logger, {
    shells,
    defaultCwd: homedir(),
    directoryExists,
    defaultShellProfileId: () =>
      pickDefaultShellProfileId(shells, settings.get().defaultShellProfileId),
    availableShellProfiles: () => shells.available().map(({ id, label }) => ({ id, label }))
  })

  return {
    logger,
    settings,
    terminal,
    workspace,
    git: createGitService(logger),
    // `process.pid` crosses here so the service can refuse to let the user
    // kill the application they are clicking in.
    ports: createPortService(logger, process.pid),
    updates: createUpdateService(logger, {
      currentVersion: app.getVersion(),
      getSettings: () => {
        const { checkForUpdatesOnStartup, skippedUpdateVersion } = settings.get()
        return { checkForUpdatesOnStartup, skippedUpdateVersion }
      },
      readLastCheckAt: () => readManifestTimestamp(paths.manifestFile, 'lastUpdateCheckAt'),
      recordCheckAt: (at) => patchManifest(paths.manifestFile, { lastUpdateCheckAt: at }, logger)
    }),
    dataRoot: {
      resolution,
      applySwitch: (target) => {
        // Copy first, pointer second: a crash between the two leaves the
        // pointer on the old folder and the copy as a harmless spare.
        copyDataToNewRoot(paths, target, logger)
        writeDataRootPointer(resolution.pointerFile, resolution.defaultRoot, target)
      }
    }
  }
}
