import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { activeScreen, launchPackaged } from './support'

/**
 * A terminal is a real OS process. Closing the app — and, on a user's machine,
 * uninstalling it — must not leave shells running with no window attached.
 *
 * This covers the half of the Phase 11 uninstall check that can be verified
 * without installing: the app's own shutdown path. That the uninstaller removes
 * the install directory is in the clean-machine script.
 *
 * Descendants of the app are counted rather than every shell on the machine:
 * a global count is dominated by whatever else the developer is running, and a
 * noisy baseline would make this pass or fail for reasons of its own.
 */
const descendantShells = (rootPid: number): number[] => {
  const script = `
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CreationDate
    $root = $all | Where-Object { $_.ProcessId -eq ${rootPid} } | Select-Object -First 1
    if (-not $root) { return }

    # Windows recycles process ids and never rewrites the ParentProcessId of a
    # process whose parent has exited. A long-lived shell can therefore point at
    # an id this app has since been given, and the walk below would adopt that
    # shell and everything under it — on a developer's machine, their own dev
    # server. Nothing this app started can predate this app, so the tree is
    # walked over processes no older than the app itself.
    $all = $all | Where-Object { $_.CreationDate -ge $root.CreationDate }

    $wanted = @(${rootPid})
    $found = @()
    for ($i = 0; $i -lt 12; $i++) {
      $children = $all | Where-Object { $wanted -contains $_.ParentProcessId }
      if (-not $children) { break }
      $new = $children | Where-Object { $found -notcontains $_.ProcessId }
      if (-not $new) { break }
      $found += $new.ProcessId
      $wanted = $new.ProcessId
    }
    $all |
      Where-Object { $found -contains $_.ProcessId -and $_.Name -match 'bash|powershell|pwsh|cmd' } |
      ForEach-Object { $_.ProcessId }
  `
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8'
  })
  return out
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

const stillAlive = (pids: readonly number[]): number[] =>
  pids.filter((pid) => {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' })
    return out.includes(String(pid))
  })

test('closing the packaged app leaves no shell behind', async () => {
  const gitdeck = await launchPackaged()
  const rootPid = gitdeck.app.process().pid
  expect(rootPid).toBeDefined()

  await expect.poll(() => activeScreen(gitdeck.page), { timeout: 30_000 }).toMatch(/\$|>|#/)
  await gitdeck.page
    .getByRole('complementary', { name: 'Terminal Navigator' })
    .getByRole('button', { name: 'New terminal' })
    .click()
  await expect(gitdeck.page.locator('.terminal-session-item')).toHaveCount(2)

  // Guards the guard: with nothing found, the assertion after close would be
  // vacuously true.
  const spawned = await new Promise<number[]>((resolve) => {
    setTimeout(() => resolve(descendantShells(rootPid!)), 2_000)
  })
  expect(spawned.length).toBeGreaterThan(0)

  await gitdeck.close()

  // `will-quit` reaps every PTY, so every shell the app started is now gone.
  await expect.poll(() => stillAlive(spawned), { timeout: 30_000 }).toEqual([])
})
