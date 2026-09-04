import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mayOpenExternally, WINDOW_BACKGROUND } from './createWindow'

describe('the colour painted before the renderer exists', () => {
  it('is the renderer’s own canvas', () => {
    // Two copies of one value, in two processes that cannot share a constant:
    // Electron needs it at window construction, the stylesheet owns it. Pinned
    // here the same way dataRoot is pinned to storagePaths — the alternative
    // is a flash of an unrelated colour at every launch, which is what
    // #1e1e1e was until Phase 23.
    const css = readFileSync(
      join(import.meta.dirname, '../../renderer/src/shared/styles/global.css'),
      'utf8'
    )
    const surface = /--surface\s*:\s*(#[0-9a-f]{6})\s*;/i.exec(css)?.[1]

    expect(surface, 'global.css declares an opaque --surface').toBeDefined()
    expect(WINDOW_BACKGROUND).toBe(surface)
  })
})

/**
 * The window-open handler is the one place page content can name a URL and
 * have the operating system act on it. `createWindow` itself needs a real
 * BrowserWindow, so the decision is a pure function and this is what tests it.
 */
describe('what may be handed to the browser', () => {
  it('allows the web', () => {
    expect(mayOpenExternally('https://github.com/b0yblake/Git-SCM-management')).toBe(true)
    expect(mayOpenExternally('http://localhost:5173')).toBe(true)
  })

  it('refuses everything the operating system would rather not be asked', () => {
    // file: opens a file, and a custom scheme starts whichever application
    // claimed it — neither is a link, and neither belongs in a browser.
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'ms-settings:windowsupdate',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vscode://file/C:/secrets',
      ''
    ]) {
      expect(mayOpenExternally(url), url).toBe(false)
    }
  })

  it('is not fooled by a scheme that merely contains an allowed one', () => {
    expect(mayOpenExternally('nothttps://evil')).toBe(false)
    expect(mayOpenExternally(' https://evil')).toBe(false)
  })
})
