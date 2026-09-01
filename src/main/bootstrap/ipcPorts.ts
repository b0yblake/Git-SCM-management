import { BrowserWindow, ipcMain } from 'electron'

/**
 * The two things a feature's IPC module needs from Electron, narrowed to an
 * interface so handlers can be unit-tested without booting an app.
 */
export interface IpcHandlerRegistry {
  /** Request/response — backs `ipcRenderer.invoke`. */
  handle(channel: string, handler: (payload: unknown) => unknown): void
  /** Fire-and-forget — backs `ipcRenderer.send`. */
  on(channel: string, handler: (payload: unknown) => void): void
}

/** Pushes an event to every renderer that is still alive. */
export interface EventBroadcaster {
  send(channel: string, payload: unknown): void
}

export const electronIpcRegistry: IpcHandlerRegistry = {
  handle(channel, handler) {
    ipcMain.handle(channel, (_event, payload: unknown) => handler(payload))
  },
  on(channel, handler) {
    ipcMain.on(channel, (_event, payload: unknown) => {
      handler(payload)
    })
  }
}

export const electronBroadcaster: EventBroadcaster = {
  send(channel, payload) {
    for (const window of BrowserWindow.getAllWindows()) {
      // A window can be torn down between a PTY byte arriving and this loop;
      // sending to a destroyed webContents throws.
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue
      window.webContents.send(channel, payload)
    }
  }
}
