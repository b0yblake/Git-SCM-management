import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
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
import { createWorkspaceService, type WorkspaceService } from '../features/workspace/public'
import { combineSinks, createFileSink } from './fileSink'
import { consoleSink, createLogger, type Logger } from './logger'

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
  // The console sink is invisible in a packaged app, so production keeps a
  // file alongside it. `logs` is where Windows users and support already look.
  const logger = createLogger(
    combineSinks(consoleSink, createFileSink({ filePath: join(app.getPath('logs'), 'gitdeck.log') }))
  )
  const userData = app.getPath('userData')
  const settings = createSettingsService(userData, logger)
  const workspace = createWorkspaceService(userData, logger)

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
    ports: createPortService(logger, process.pid)
  }
}
