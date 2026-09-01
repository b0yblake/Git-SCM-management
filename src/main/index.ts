import { app, BrowserWindow } from 'electron'
import { IPC } from '@shared/contracts/ipc'
import { installApplicationMenu } from './bootstrap/applicationMenu'
import { createContainer } from './bootstrap/container'
import { createWindow } from './bootstrap/createWindow'
import { electronBroadcaster } from './bootstrap/ipcPorts'
import { registerIpc } from './bootstrap/registerIpc'

const container = createContainer()

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
