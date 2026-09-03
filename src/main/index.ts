import { app, BrowserWindow } from 'electron'
import { IPC } from '@shared/contracts/ipc'
import { installApplicationMenu } from './bootstrap/applicationMenu'
import { createContainer } from './bootstrap/container'
import { createWindow } from './bootstrap/createWindow'
import { registerExplorerContextMenu } from './bootstrap/explorerMenu'
import { electronBroadcaster } from './bootstrap/ipcPorts'
import { registerIpc } from './bootstrap/registerIpc'

// One GitDeck (Phase 18). A second launch — typically Explorer's
// "Open in GitDeck" — forwards its argv to this instance and exits, so the
// folder opens in the window the user already has.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const container = createContainer()

  // The cold-start half of --open-path / --open-workspace: queued now,
  // pulled by the renderer once session restore has settled.
  container.openPath.accept(process.argv)
  container.workspaceLaunch.accept(process.argv)

  app.on('second-instance', (_event, argv) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
    const path = container.openPath.accept(argv)
    if (path) electronBroadcaster.send(IPC.terminal.openPath, { path })
    const workspaceId = container.workspaceLaunch.accept(argv)
    if (workspaceId) electronBroadcaster.send(IPC.workspace.open, { workspaceId })
  })

  void app.whenReady().then(() => {
    registerIpc(container)
    installApplicationMenu()
    createWindow()
    container.logger.info('app ready')

    // Fired after the window exists and never awaited: startup must not wait on
    // the network, and every quiet outcome (disabled, throttled, failed,
    // up-to-date, skipped) pushes nothing (Phase 16).
    void container.updates.checkOnStartup().then((result) => {
      if (result?.status === 'update-available') {
        electronBroadcaster.send(IPC.updates.available, result)
      }
    })

    // Self-healing per launch; packaged only — a dev electron.exe in the
    // Explorer menu would be worse than no entry (Phase 18).
    if (app.isPackaged) {
      void registerExplorerContextMenu({ exePath: process.execPath, logger: container.logger })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    container.logger.info('app shutting down')
    // Every PTY is a real OS process; leaving one behind outlives the app.
    container.terminal.disposeAll()
  })
}
