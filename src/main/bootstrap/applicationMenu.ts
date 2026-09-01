import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC } from '@shared/contracts/ipc'

/**
 * The native application menu (Phase 12).
 *
 * Setting a custom menu **replaces** Electron's default one, so this template
 * recreates the standard Edit/View/Window roles — losing Ctrl+C/Ctrl+V in
 * every input field would be a regression hiding inside a feature addition.
 * The one novel entry is File → Port…, which does nothing but ask the focused
 * renderer to open the ports modal; everything the modal then shows travels
 * over the normal ports list channel.
 */

/** What the click handler needs from a window, narrowed for testing. */
export interface MenuTargetWindow {
  isDestroyed(): boolean
  readonly webContents: {
    isDestroyed(): boolean
    send(channel: string): void
  }
}

/**
 * Sends the ports open event to the focused, live window. No focused window —
 * the user clicked the menu of a dying app, or nothing has focus — is a no-op,
 * never a throw: a menu click must not be able to crash Main.
 */
export const createOpenPortsHandler =
  (getFocusedWindow: () => MenuTargetWindow | null) => (): void => {
    const window = getFocusedWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(IPC.ports.open)
  }

export const buildApplicationMenuTemplate = (
  onOpenPorts: () => void
): MenuItemConstructorOptions[] => [
  {
    label: 'File',
    submenu: [
      // `id` exists so the packaged E2E can reach the real click handler; the
      // label is exactly what the plan asks the user to look for.
      { id: 'open-ports', label: 'Port…', click: onOpenPorts },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  {
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'close' }]
  }
]

export const installApplicationMenu = (): void => {
  const template = buildApplicationMenuTemplate(
    createOpenPortsHandler(() => BrowserWindow.getFocusedWindow())
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
