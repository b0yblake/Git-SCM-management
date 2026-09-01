import { app, BrowserWindow } from 'electron'
import { installApplicationMenu } from './bootstrap/applicationMenu'
import { createContainer } from './bootstrap/container'
import { createWindow } from './bootstrap/createWindow'
import { registerIpc } from './bootstrap/registerIpc'

const container = createContainer()

void app.whenReady().then(() => {
  registerIpc(container)
  installApplicationMenu()
  createWindow()
  container.logger.info('app ready')

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
