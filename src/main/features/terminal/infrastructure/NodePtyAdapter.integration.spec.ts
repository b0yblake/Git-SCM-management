import { afterEach, describe, expect, it } from 'vitest'
import type { PtyProcess } from '../domain/PtyProcess'
import { NodePtyAdapter } from './NodePtyAdapter'
import { createShellRegistry } from './shellProfiles'
import { detectInstalledShellProfiles } from './WindowsShellDetector'
import { createFakeLogger } from '@main/testing/FakeLogger'

/**
 * Spawns a real shell — the one thing `FakePtyFactory` cannot prove.
 *
 * Uses `cmd` because it is present on every Windows machine, so this suite does
 * not depend on Git or PowerShell 7 being installed.
 */
const shells = createShellRegistry(detectInstalledShellProfiles(createFakeLogger()))
const adapter = new NodePtyAdapter(shells)
const spawned: PtyProcess[] = []

const open = (): PtyProcess => {
  const pty = adapter.create({
    shellProfileId: 'cmd',
    cwd: process.cwd(),
    cols: 80,
    rows: 24
  })
  spawned.push(pty)
  return pty
}

afterEach(() => {
  for (const pty of spawned.splice(0)) {
    try {
      pty.kill()
    } catch {
      // already gone
    }
  }
})

describe.runIf(process.platform === 'win32')('NodePtyAdapter against a real shell', () => {
  it('produces output containing what was echoed', async () => {
    const pty = open()

    const output = await new Promise<string>((resolve, reject) => {
      let buffer = ''
      const timer = setTimeout(() => reject(new Error(`timed out; saw: ${buffer}`)), 20_000)
      pty.onData((data) => {
        buffer += data
        if (buffer.includes('gitdeck-pty-ok')) {
          clearTimeout(timer)
          resolve(buffer)
        }
      })
      pty.write('echo gitdeck-pty-ok\r')
    })

    expect(output).toContain('gitdeck-pty-ok')
  }, 30_000)

  it('resizing a live PTY does not throw', () => {
    const pty = open()

    expect(() => pty.resize(120, 40)).not.toThrow()
  })

  it('kill terminates the process and fires the exit event', async () => {
    const pty = open()

    const exitCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no exit event')), 20_000)
      pty.onExit((code) => {
        clearTimeout(timer)
        resolve(code)
      })
      pty.kill()
    })

    expect(exitCode).toBeTypeOf('number')
  }, 30_000)

  it('unsubscribing stops data callbacks', async () => {
    const pty = open()
    const seen: string[] = []
    const unsubscribe = pty.onData((data) => seen.push(data))

    await new Promise((resolve) => setTimeout(resolve, 1000))
    unsubscribe()
    const countAfterUnsubscribe = seen.length
    pty.write('echo second\r')
    await new Promise((resolve) => setTimeout(resolve, 1000))

    expect(seen.length).toBe(countAfterUnsubscribe)
  }, 30_000)
})
