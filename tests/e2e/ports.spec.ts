import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { expect, test } from '@playwright/test'
import { launchPackaged } from './support'

/**
 * Phase 12, end to end against the packaged application: the native
 * File → Port… menu opens the real modal, the modal shows a real disposable
 * listener, confirming really terminates it, and the port is bindable again.
 *
 * The one process this test selects and kills is a Node child it spawned
 * itself.
 */

// The port is printed as a *string*: console.log of a bare number gets ANSI
// colour codes when the inherited environment forces colour (Playwright's
// worker does), and an invisible escape code around the digits is exactly the
// kind of bug that eats an afternoon.
const TCP_CHILD = `
  const net = require('net')
  const server = net.createServer()
  server.listen(0, '127.0.0.1', () => console.log(String(server.address().port)))
  setInterval(() => {}, 1000)
`

const disposableListener = (): Promise<{ child: ChildProcess; port: number }> =>
  new Promise((resolve, reject) => {
    // The test runner's own NODE_OPTIONS (Playwright instruments child Node
    // processes through it) must not reach the disposable child — it can
    // prepend output or crash the -e script.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'FORCE_COLOR'].includes(entry[0])
      )
    )
    const child = spawn(process.execPath, ['-e', TCP_CHILD], { windowsHide: true, env })
    let out = ''
    let err = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      const port = out.split('\n').find((line) => /^\d+$/.test(line.trim()))
      if (port) resolve({ child, port: Number(port.trim()) })
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => reject(new Error(`listener exited early (${code}): ${err}`)))
    setTimeout(() => reject(new Error(`listener never printed a port: ${out} ${err}`)), 20_000)
  })

const canBind = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })

/** PowerShell children of the app — the inspector must never outlive it. */
const inspectorsUnder = (parentPid: number): number[] => {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' and ParentProcessId = ${parentPid}" | ForEach-Object { $_.ProcessId }`
    ],
    { encoding: 'utf8' }
  )
  return out
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

test('File → Port… → select the disposable listener → its port is released', async () => {
  const { child, port } = await disposableListener()
  const gitdeck = await launchPackaged()
  const appPid = gitdeck.app.process().pid!

  try {
    // The menu handler targets the *focused* window, so focus it first — a
    // programmatic click does not focus anything by itself.
    await gitdeck.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.focus()
    })
    await gitdeck.app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('open-ports')?.click()
    })

    // The real modal, fed by the real PowerShell enumeration.
    const dialog = gitdeck.page.getByRole('dialog', { name: 'Ports' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('Filter by port, PID or process name').fill(String(port))
    const row = dialog.getByLabel(`Select node (PID ${child.pid})`)
    await expect(row).toBeVisible({ timeout: 30_000 })

    // Select, read the confirmation, confirm.
    await row.check()
    await dialog.getByRole('button', { name: 'Terminate selected' }).click()
    await expect(dialog.getByLabel('Confirm termination')).toContainText(`PID ${child.pid}`)
    await expect(dialog.getByLabel('Confirm termination')).toContainText(`:${port}`)
    await dialog.getByRole('button', { name: 'Terminate 1 process' }).click()

    // Per-target feedback, and the refreshed list no longer shows the binding.
    await expect(dialog.getByRole('status')).toContainText(`Terminated: node (PID ${child.pid})`, {
      timeout: 60_000
    })
    await expect(dialog.getByLabel(`Select node (PID ${child.pid})`)).toHaveCount(0)

    // The port is genuinely free again — a new server can bind it.
    await expect.poll(() => canBind(port), { timeout: 15_000 }).toBe(true)

    // A second open focuses/refreshes the one modal; it must not stack.
    await gitdeck.app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('open-ports')?.click()
    })
    await expect(gitdeck.page.getByRole('dialog', { name: 'Ports' })).toHaveCount(1)

    // Escape closes it.
    await gitdeck.page.keyboard.press('Escape')
    await expect(gitdeck.page.getByRole('dialog', { name: 'Ports' })).toHaveCount(0)
  } finally {
    await gitdeck.close()
    if (child.exitCode === null) child.kill()
  }

  // No inspector PowerShell survives the app.
  await expect.poll(() => inspectorsUnder(appPid), { timeout: 15_000 }).toEqual([])
})
