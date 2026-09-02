import { dialog, shell } from 'electron'
import { registerSettingsIpc } from '../features/settings/public'
import { registerGitIpc } from '../features/git/public'
import { registerPortsIpc } from '../features/ports/public'
import { registerTerminalIpc } from '../features/terminal/public'
import { registerUpdatesIpc } from '../features/updates/public'
import { registerWorkspaceIpc } from '../features/workspace/public'
import type { AppContainer } from './container'
import { registerDataRootIpc } from './dataRootIpc'
import { electronBroadcaster, electronIpcRegistry } from './ipcPorts'

/**
 * Single place where every feature's IPC handlers are registered.
 *
 * Git is registered last and depends on nothing else here: removing it would
 * leave the other three working.
 */
export const registerIpc = (container: AppContainer): void => {
  registerTerminalIpc({
    registry: electronIpcRegistry,
    broadcaster: electronBroadcaster,
    terminal: container.terminal,
    logger: container.logger
  })

  registerSettingsIpc({
    registry: electronIpcRegistry,
    settings: container.settings,
    logger: container.logger
  })

  registerWorkspaceIpc({
    registry: electronIpcRegistry,
    workspace: container.workspace,
    logger: container.logger
  })

  registerGitIpc({
    registry: electronIpcRegistry,
    git: container.git,
    logger: container.logger
  })

  registerPortsIpc({
    registry: electronIpcRegistry,
    ports: container.ports,
    logger: container.logger
  })

  registerUpdatesIpc({
    registry: electronIpcRegistry,
    updates: container.updates,
    // The only external-open in the app, and it only ever receives the URL
    // Main minted for the last check result.
    openExternal: (url) => shell.openExternal(url),
    logger: container.logger
  })

  registerDataRootIpc({
    registry: electronIpcRegistry,
    resolution: container.dataRoot.resolution,
    // The native picker is the only source of a path; the renderer can only
    // ask for it to be shown.
    pickFolder: async (defaultPath) => {
      const result = await dialog.showOpenDialog({
        defaultPath,
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null)
    },
    applySwitch: container.dataRoot.applySwitch,
    logger: container.logger
  })

  container.logger.debug(
    'registerIpc: terminal, settings, workspace, git, ports, updates and storage channels registered'
  )
}
