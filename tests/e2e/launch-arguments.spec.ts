import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchPackaged, PACKAGED_APP, sessionTitles } from './support'

/**
 * The launch arguments Explorer and a workspace shortcut hand to a running
 * GitDeck (Phases 18 and 19).
 *
 * This path cannot be reached from inside one process. It needs a real
 * single-instance lock, a second `GitDeck.exe` that forwards its argv and
 * exits, and Chromium's argv rebuild in between — the rebuild is what tore
 * the original `--open-path <dir>` pair apart, a bug the unit suite could not
 * see and a manual smoke run found. Added by Checkpoint C, which found both
 * phases shipped with no packaged coverage at all.
 *
 * Both phases are covered here rather than in two files because they share
 * the one expensive thing: a launched app holding the lock.
 */

const WORKSPACE_ID = 'ws_c0ffee00-1111-4222-8333-444455556666'
const TERMINAL_ID = 'term_c0ffee00-1111-4222-8333-444455556667'

/** A second GitDeck: forwards its argv to the instance holding the lock. */
const forward = (profile: string, argument: string): Promise<number | null> =>
  new Promise((resolve, reject) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE'
      )
    )

    const child = spawn(PACKAGED_APP, [`--user-data-dir=${profile}`, argument], {
      env,
      stdio: 'ignore'
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code))
  })

test.describe('launch arguments reach the running instance', () => {
  let profile: string
  let folder: string

  test.beforeAll(() => {
    profile = mkdtempSync(join(tmpdir(), 'gitdeck-args-'))
    folder = mkdtempSync(join(tmpdir(), 'gitdeck-openpath-'))

    // Seeded before launch: a workspace shortcut names a workspace that
    // already exists, and the .lnk itself is written by a native save dialog
    // no test can drive. The id in the file is the whole payload the shortcut
    // carries, so seeding the file exercises the same path the shortcut does.
    mkdirSync(join(profile, 'workspaces'), { recursive: true })
    writeFileSync(
      join(profile, 'workspaces', `${WORKSPACE_ID}.json`),
      JSON.stringify(
        {
          id: WORKSPACE_ID,
          name: 'Shortcut Target',
          version: 1,
          terminals: [
            {
              id: TERMINAL_ID,
              title: 'Shortcut Terminal',
              cwd: folder,
              shellProfileId: 'cmd'
            }
          ],
          activeTerminalId: TERMINAL_ID,
          createdAt: 1756700000000,
          updatedAt: 1756700000000
        },
        null,
        2
      ),
      'utf8'
    )
  })

  test.afterAll(() => {
    for (const directory of [profile, folder]) {
      try {
        rmSync(directory, { recursive: true, force: true })
      } catch {
        // A stale temp directory is not worth failing the suite over.
      }
    }
  })

  test('a second launch opens a folder, then focuses it instead of duplicating', async () => {
    const gitdeck = await launchPackaged(profile)

    try {
      await expect(gitdeck.page.locator('.terminal-session-item')).toHaveCount(1)

      // Phase 18. The `=` form is the one Explorer's registry command uses,
      // and the only one that survives the argv rebuild.
      expect(await forward(profile, `--open-path=${folder}`)).toBe(0)

      const expected = basename(folder)
      await expect.poll(() => sessionTitles(gitdeck.page), { timeout: 30_000 }).toContain(expected)

      // Phase 18's duplicate rule: the same folder again focuses the terminal
      // that is already there rather than opening a second one.
      expect(await forward(profile, `--open-path=${folder}`)).toBe(0)
      await expect
        .poll(
          async () => (await sessionTitles(gitdeck.page)).filter((t) => t === expected).length,
          { timeout: 20_000 }
        )
        .toBe(1)
    } finally {
      await gitdeck.close()
    }
  })

  test('a second launch opens a workspace by id', async () => {
    const gitdeck = await launchPackaged(profile)

    try {
      await expect(gitdeck.page.locator('.terminal-session-item')).toHaveCount(1)

      // Phase 19. The shortcut carries an id and nothing else; Main
      // revalidates it against the workspaces on disk before anything opens.
      expect(await forward(profile, `--open-workspace=${WORKSPACE_ID}`)).toBe(0)

      await expect
        .poll(() => sessionTitles(gitdeck.page), { timeout: 30_000 })
        .toContain('Shortcut Terminal')
    } finally {
      await gitdeck.close()
    }
  })

  test('an unknown workspace id is dropped, and the app carries on', async () => {
    const gitdeck = await launchPackaged(profile)

    try {
      await expect(gitdeck.page.locator('.terminal-session-item')).toHaveCount(1)
      const before = await sessionTitles(gitdeck.page)

      expect(
        await forward(profile, '--open-workspace=ws_deadbeef-0000-4000-8000-000000000000')
      ).toBe(0)

      // Nothing opens, nothing crashes: the window is still answering.
      await expect(gitdeck.page.locator('.terminal-navigator')).toBeVisible()
      expect(await sessionTitles(gitdeck.page)).toEqual(before)
    } finally {
      await gitdeck.close()
    }
  })
})
