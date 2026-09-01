import { afterEach, describe, expect, it } from 'vitest'
import { createFakeLogger } from '@main/testing/FakeLogger'
import type { PtyProcess } from '../domain/PtyProcess'
import { NodePtyAdapter } from './NodePtyAdapter'
import { createShellRegistry } from './shellProfiles'
import { detectInstalledShellProfiles } from './WindowsShellDetector'

/**
 * Runs detection against this actual machine.
 *
 * Results are machine-specific by nature, so the assertions are about
 * *consistency* — whatever was detected must be launchable — rather than about
 * a fixed list. `WindowsShellDetector.spec.ts` covers the logic itself with a
 * fake probe and needs no shell installed.
 */
const logger = createFakeLogger()
const profiles = detectInstalledShellProfiles(logger)
const registry = createShellRegistry(profiles)
const adapter = new NodePtyAdapter(registry)

const spawned: PtyProcess[] = []

afterEach(() => {
  for (const pty of spawned.splice(0)) {
    try {
      pty.kill()
    } catch {
      // already gone
    }
  }
})

describe.runIf(process.platform === 'win32')('detection on this machine', () => {
  it('finds at least one shell — a Windows box always has cmd', () => {
    expect(profiles.length).toBeGreaterThan(0)
    expect(profiles.map((profile) => profile.id)).toContain('cmd')
  })

  it('reports a real, existing executable for everything it found', () => {
    for (const profile of profiles) {
      expect(profile.file).toMatch(/\.exe$/i)
      expect(registry.resolve(profile.id).file).toBe(profile.file)
    }
  })

  it('never reports a shell it did not find', () => {
    for (const id of ['git-bash', 'powershell', 'pwsh', 'cmd', 'wsl'] as const) {
      if (registry.has(id)) continue
      expect(() => registry.resolve(id)).toThrow()
    }
  })

  /**
   * The claim that matters: a profile in the list can actually be launched.
   * WSL is skipped — it starts a distro VM, which is far too heavy for a suite.
   */
  it.each(
    detectInstalledShellProfiles(createFakeLogger())
      .filter((profile) => profile.id !== 'wsl')
      .map((profile) => [profile.id, profile.label] as const)
  )(
    'launches %s (%s) through the adapter',
    async (id) => {
      const pty = adapter.create({ shellProfileId: id, cwd: process.cwd(), cols: 80, rows: 24 })
      spawned.push(pty)

      const sawOutput = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 20_000)
        pty.onData((data) => {
          if (data.length > 0) {
            clearTimeout(timer)
            resolve(true)
          }
        })
      })

      expect(sawOutput).toBe(true)
    },
    30_000
  )
})
