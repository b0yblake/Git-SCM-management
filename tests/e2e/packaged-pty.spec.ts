import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { activeScreen, launchPackaged, PACKAGED_APP } from './support'

const ROOT = resolve(import.meta.dirname, '../..')
const UNPACKED = join(ROOT, 'release', 'win-unpacked')
const NATIVE = join(UNPACKED, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty')

/**
 * The one check that cannot be substituted by a dev-mode test.
 *
 * `node-pty` is a native module: it loads a `.node` binary and, on Windows,
 * spawns `OpenConsole.exe` beside it. Neither can be read from inside an asar
 * archive, so both must be unpacked. The failure mode this guards against is
 * an app that installs cleanly and then cannot open a single terminal.
 */
test.describe('the packaged native module', () => {
  test('the built app exists to test at all', () => {
    expect(existsSync(PACKAGED_APP), `run \`npm run package\` first — ${PACKAGED_APP}`).toBe(true)
  })

  test('the native binary is unpacked, not sealed inside the asar', () => {
    for (const file of [
      'prebuilds/win32-x64/pty.node',
      'prebuilds/win32-x64/conpty.node',
      'prebuilds/win32-x64/conpty/conpty.dll',
      'prebuilds/win32-x64/conpty/OpenConsole.exe'
    ]) {
      expect(existsSync(join(NATIVE, file)), file).toBe(true)
    }
  })

  test('the app code itself is inside the asar', () => {
    expect(existsSync(join(UNPACKED, 'resources', 'app.asar'))).toBe(true)
  })

  test('the shipped version is the intended release', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }

    expect(pkg.version).toBe('0.1.0')
  })

  /** The real one: a PTY spawned by the packaged binary, running a real shell. */
  test('the packaged app spawns a working PTY', async () => {
    const gitdeck = await launchPackaged()

    try {
      await expect(gitdeck.page.locator('.terminal-tab')).toHaveCount(1)

      // A prompt only appears if node-pty loaded and a shell actually started.
      await expect.poll(() => activeScreen(gitdeck.page), { timeout: 30_000 }).toMatch(/\$|>|#/)

      await gitdeck.page.locator('.xterm-helper-textarea').fill('')
      await gitdeck.page.locator('.xterm-helper-textarea').type('echo packaged-pty-ok\r')

      await expect
        .poll(() => activeScreen(gitdeck.page), { timeout: 30_000 })
        .toContain('packaged-pty-ok')
    } finally {
      await gitdeck.close()
    }
  })

  /** A packaged app has no console, so a log file is the only way to see in. */
  test('production logs are written where a user could find them', async () => {
    const gitdeck = await launchPackaged()

    try {
      // The callback runs inside the Electron main process, which has none of
      // this file's imports — so it returns the directory and joins out here.
      const logsDir = await gitdeck.app.evaluate(({ app }) => app.getPath('logs'))
      const logPath = join(logsDir, 'gitdeck.log')

      await expect.poll(() => existsSync(logPath), { timeout: 20_000 }).toBe(true)
      expect(readFileSync(logPath, 'utf8')).toContain('app ready')
    } finally {
      await gitdeck.close()
    }
  })
})
