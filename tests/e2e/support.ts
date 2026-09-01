import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * The packaged executable. Phase 11 is about what ships, so these tests run
 * against `release/win-unpacked` rather than `out/` — the difference between
 * the two is exactly where native-module packaging goes wrong.
 */
export const PACKAGED_APP = join(ROOT, 'release', 'win-unpacked', 'GitDeck.exe')

export interface LaunchedApp {
  readonly app: ElectronApplication
  readonly page: Page
  readonly userDataDir: string
  close(): Promise<void>
}

/**
 * Launches the built app against a throwaway profile.
 *
 * `ELECTRON_RUN_AS_NODE` is stripped because a shell that has it set turns
 * every Electron launch into a bare Node process — which fails in a way that
 * looks like a packaging fault and is not one.
 */
export const launchPackaged = async (userDataDir?: string): Promise<LaunchedApp> => {
  const profile = userDataDir ?? mkdtempSync(join(tmpdir(), 'gitdeck-e2e-'))
  // Playwright wants a fully-defined environment, and `process.env` is typed
  // with optional values under `exactOptionalPropertyTypes`.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE'
    )
  )

  const app = await electron.launch({
    executablePath: PACKAGED_APP,
    args: [`--user-data-dir=${profile}`],
    env
  })

  const page = await app.firstWindow()
  await page.waitForSelector('.terminal-navigator', { timeout: 30_000 })

  return {
    app,
    page,
    userDataDir: profile,
    async close() {
      await app.close()
      if (!userDataDir) {
        try {
          rmSync(profile, { recursive: true, force: true })
        } catch {
          // Electron can still hold a handle for a moment; a stale temp
          // profile is not worth failing a test over.
        }
      }
    }
  }
}

/** The visible terminal's rendered rows. */
export const activeScreen = (page: Page): Promise<string> =>
  page
    .locator('.terminal-pane--active .xterm-rows')
    .innerText()
    .catch(() => '')

export const sessionTitles = (page: Page): Promise<string[]> =>
  page.locator('.terminal-session-item__copy strong').allInnerTexts()
