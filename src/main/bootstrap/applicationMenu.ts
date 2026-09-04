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
 * Sends a menu signal to the focused, live window. No focused window — the
 * user clicked the menu of a dying app, or nothing has focus — is a no-op,
 * never a throw: a menu click must not be able to crash Main.
 */
const sendToFocusedWindow =
  (getFocusedWindow: () => MenuTargetWindow | null, channel: string) => (): void => {
    const window = getFocusedWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(channel)
  }

export const createOpenPortsHandler = (
  getFocusedWindow: () => MenuTargetWindow | null
): (() => void) => sendToFocusedWindow(getFocusedWindow, IPC.ports.open)

/** Help → About GitDeck. Carries no payload; the dialog is renderer-side. */
export const createOpenAboutHandler = (
  getFocusedWindow: () => MenuTargetWindow | null
): (() => void) => sendToFocusedWindow(getFocusedWindow, IPC.about.open)

export const buildApplicationMenuTemplate = (
  onOpenPorts: () => void,
  onOpenAbout: () => void
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
  },
  {
    label: 'Help',
    submenu: [
      // `id` for the same reason as Port…: the packaged E2E reaches the real
      // click handler through it.
      { id: 'open-about', label: 'About GitDeck', click: onOpenAbout }
    ]
  }
]

export const installApplicationMenu = (): void => {
  const focused = (): MenuTargetWindow | null => BrowserWindow.getFocusedWindow()
  const template = buildApplicationMenuTemplate(
    createOpenPortsHandler(focused),
    createOpenAboutHandler(focused)
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
