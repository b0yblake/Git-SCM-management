import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { activeScreen, launchPackaged, tabTitles } from './support'

/**
 * The critical flow, end to end, against the packaged application.
 *
 * One test rather than ten: the steps are a sequence — a workspace has to be
 * saved before a restart can restore it — and splitting them would mean either
 * ten app launches or shared state pretending to be independent.
 */

const type = async (page: Page, text: string): Promise<void> => {
  const input = page.locator('.terminal-tabs__panel:not([hidden]) .xterm-helper-textarea')
  await input.type(text)
}

const fillField = async (page: Page, label: string, value: string, index = 0): Promise<void> => {
  await page.getByLabel(label).nth(index).fill(value)
}

test('a user can work, save a workspace, restart and find it restored', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'gitdeck-smoke-'))
  const repo = mkdtempSync(join(tmpdir(), 'gitdeck-smoke-repo-'))
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  }

  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  writeFileSync(join(repo, 'a.txt'), 'a', 'utf8')
  git('add', '-A')
  git('commit', '-qm', 'one')

  const first = await launchPackaged(profile)

  try {
    // 1–2. The app starts, visible, with a terminal.
    await expect(first.page.locator('.terminal-tab')).toHaveCount(1)

    // 3–4. Type into it and read the answer back.
    await expect.poll(() => activeScreen(first.page), { timeout: 30_000 }).toMatch(/\$|>|#/)
    await type(first.page, 'echo smoke-hello\r')
    await expect.poll(() => activeScreen(first.page), { timeout: 30_000 }).toContain('smoke-hello')

    // 5. A second terminal.
    await first.page.getByRole('button', { name: 'New terminal' }).click()
    await expect(first.page.locator('.terminal-tab')).toHaveCount(2)

    // 6. Switching back finds the first terminal's output still there.
    await first.page.locator('.terminal-tab__label').first().click()
    await expect.poll(() => activeScreen(first.page), { timeout: 20_000 }).toContain('smoke-hello')

    // 7. Closing one leaves the other alive.
    await first.page.locator('.terminal-tab__close').last().click()
    // Scoped to the dialog: the tab's own close button is also named "Close
    // Terminal", because the tab happens to be called Terminal.
    await first.page.getByRole('dialog').getByRole('button', { name: 'Close terminal' }).click()
    await expect(first.page.locator('.terminal-tab')).toHaveCount(1)
    await expect.poll(() => activeScreen(first.page), { timeout: 20_000 }).toContain('smoke-hello')

    // 8. Author and save a workspace, with a terminal inside the git repo.
    await first.page.getByRole('button', { name: 'New workspace' }).click()
    await fillField(first.page, 'Workspace name', 'Smoke')
    await first.page.getByRole('button', { name: 'Add terminal' }).click()
    await fillField(first.page, 'Title', 'Repo')
    await fillField(first.page, 'Working directory', repo)
    await first.page.getByRole('button', { name: 'Save workspace' }).click()
    await expect(first.page.getByRole('button', { name: 'Open Smoke' })).toBeVisible()

    await first.page.getByRole('button', { name: 'Open Smoke' }).click()
    await expect.poll(() => tabTitles(first.page), { timeout: 20_000 }).toContain('Repo')

    // 11. Inside a repository, the branch reaches the status bar.
    await expect(first.page.locator('.git-badge__branch')).toContainText('main', {
      timeout: 30_000
    })
  } finally {
    await first.close()
  }

  // 9. Restart against the same profile.
  const second = await launchPackaged(profile)

  try {
    // 10. The workspace, its tab name and its directory all come back.
    await expect.poll(() => tabTitles(second.page), { timeout: 30_000 }).toEqual(['Repo'])
    await expect(second.page.getByRole('button', { name: 'Open Smoke' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    await expect.poll(() => activeScreen(second.page), { timeout: 30_000 }).toMatch(/\$|>|#/)
    await expect(second.page.locator('.git-badge__branch')).toContainText('main', {
      timeout: 30_000
    })
  } finally {
    await second.close()
    for (const directory of [profile, repo]) {
      try {
        rmSync(directory, { recursive: true, force: true })
      } catch {
        // A stale temp directory is not worth failing the suite over.
      }
    }
  }
})
