import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

/**
 * The preload is emitted as CommonJS (`.cjs`) because a sandboxed renderer
 * cannot load an ESM preload — see electron.vite.config.ts.
 */
const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')

/**
 * Used while running from source. A packaged build takes its icon from the
 * installer configuration instead, so a missing file here is not fatal.
 */
const ICON = join(import.meta.dirname, '../../build/icon.png')

/**
 * What may be handed to the user's browser.
 *
 * `shell.openExternal` launches whatever the operating system has registered
 * for a scheme, which for `file:` means opening a file and for a custom scheme
 * means starting whichever application claimed it. Nothing in this renderer
 * opens a link today, so this closes a door before anything walks through it
 * rather than fixing a live bug (Checkpoint C).
 */
export const mayOpenExternally = (url: string): boolean =>
  url.startsWith('https://') || url.startsWith('http://')

export const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    // Shown only once the renderer has painted, against the app's own
    // background — otherwise Electron flashes a white rectangle first.
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'GitDeck',
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: {
      preload: PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // The renderer never sets document.title, so Electron would otherwise adopt
  // whatever the HTML says and change it out from under us.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  // Nothing in this app opens a second window; anything that tries is a link
  // and belongs in the user's browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (mayOpenExternally(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}
