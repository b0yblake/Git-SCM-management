import { execFile } from 'node:child_process'
import type { Logger } from './logger'

/**
 * The Explorer context-menu entry (Phase 18): Shift+right-click a folder →
 * **Open in GitDeck**.
 *
 * Written under HKCU so no elevation is ever requested, and rewritten on
 * every packaged launch so a moved installation self-heals. The `Extended`
 * value is what keeps the entry behind Shift — the ordinary right-click menu
 * stays untouched. `reg.exe` runs with fixed argument arrays, never through
 * a shell, and a failure is logged and swallowed: a missing menu entry must
 * not affect the app. The uninstaller deletes both keys
 * (`build/installer.nsh`).
 */
const MENU_LABEL = 'Open in GitDeck'

const KEYS: ReadonlyArray<{ readonly key: string; readonly pathToken: string }> = [
  // Right-click ON a folder: Explorer substitutes the folder into %1.
  { key: 'HKCU\\Software\\Classes\\Directory\\shell\\GitDeck', pathToken: '%1' },
  // Right-click the background INSIDE a folder: the folder arrives as %V.
  { key: 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\GitDeck', pathToken: '%V' }
]

export type ExecFileFn = (command: string, args: readonly string[]) => Promise<void>

const defaultExecFile: ExecFileFn = (command, args) =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile(command, [...args], { windowsHide: true, timeout: 10_000 }, (error) => {
      if (error) rejectPromise(error)
      else resolvePromise()
    })
  })

export interface ExplorerMenuOptions {
  /** The packaged executable the menu entry launches. */
  readonly exePath: string
  readonly logger: Logger
  readonly execFileFn?: ExecFileFn
}

/** Every `reg add` this registration performs, in order. Pure — for tests. */
export const explorerMenuCommands = (exePath: string): ReadonlyArray<readonly string[]> =>
  KEYS.flatMap(({ key, pathToken }) => [
    ['add', key, '/ve', '/d', MENU_LABEL, '/f'],
    // An empty "Extended" value is the Shift+right-click gate.
    ['add', key, '/v', 'Extended', '/d', '', '/f'],
    ['add', key, '/v', 'Icon', '/d', `"${exePath}",0`, '/f'],
    // The `=` form on purpose: a second instance's argv is rebuilt by
    // Chromium with switches separated from positional args, which tears a
    // split `--open-path <dir>` pair apart. `--open-path="<dir>"` survives
    // as one switch=value token in both cold start and forwarding.
    ['add', `${key}\\command`, '/ve', '/d', `"${exePath}" --open-path="${pathToken}"`, '/f']
  ])

export const registerExplorerContextMenu = async ({
  exePath,
  logger,
  execFileFn = defaultExecFile
}: ExplorerMenuOptions): Promise<void> => {
  try {
    for (const args of explorerMenuCommands(exePath)) {
      await execFileFn('reg.exe', args)
    }
    logger.debug('explorer context menu registered')
  } catch (error) {
    logger.warn('failed to register the explorer context menu', { error })
  }
}
