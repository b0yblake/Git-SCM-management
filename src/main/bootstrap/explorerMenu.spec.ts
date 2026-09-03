import { describe, expect, it, vi } from 'vitest'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { explorerMenuCommands, registerExplorerContextMenu } from './explorerMenu'

const EXE = 'C:\\Program Files\\GitDeck\\GitDeck.exe'

describe('the reg.exe commands', () => {
  const commands = explorerMenuCommands(EXE)

  it('writes both key branches — folder and folder background', () => {
    const keys = commands.map((args) => args[1])

    expect(keys).toContain('HKCU\\Software\\Classes\\Directory\\shell\\GitDeck')
    expect(keys).toContain('HKCU\\Software\\Classes\\Directory\\Background\\shell\\GitDeck')
  })

  it('gates the entry behind Shift with an Extended value on each key', () => {
    const extended = commands.filter((args) => args.includes('Extended'))

    expect(extended).toHaveLength(2)
  })

  it('uses the executable as the icon', () => {
    const icons = commands.filter((args) => args.includes('Icon'))

    expect(icons).toHaveLength(2)
    for (const args of icons) expect(args).toContain(`"${EXE}",0`)
  })

  it('launches with %1 for a folder and %V for a background, in the = form', () => {
    // The `=` form survives Chromium's argv rebuild on forwarding; the split
    // form gets torn apart (found by the packaged smoke test).
    const launches = commands.filter((args) => args[1]?.endsWith('\\command')).map((args) => args[4])

    expect(launches).toContain(`"${EXE}" --open-path="%1"`)
    expect(launches).toContain(`"${EXE}" --open-path="%V"`)
  })

  it('every write is forced and nothing else is written', () => {
    expect(commands).toHaveLength(8)
    for (const args of commands) {
      expect(args[0]).toBe('add')
      expect(args[args.length - 1]).toBe('/f')
    }
  })
})

describe('registration', () => {
  it('runs every command through reg.exe', async () => {
    const execFileFn = vi.fn(() => Promise.resolve())

    await registerExplorerContextMenu({ exePath: EXE, logger: createFakeLogger(), execFileFn })

    expect(execFileFn).toHaveBeenCalledTimes(8)
    for (const call of execFileFn.mock.calls as unknown as [string, readonly string[]][]) {
      expect(call[0]).toBe('reg.exe')
    }
  })

  it('a failure is logged and swallowed — the app must not care', async () => {
    const logger = createFakeLogger()
    const execFileFn = vi.fn(() => Promise.reject(new Error('access denied')))

    await expect(
      registerExplorerContextMenu({ exePath: EXE, logger, execFileFn })
    ).resolves.toBeUndefined()

    expect(logger.entriesAt('warn')).toHaveLength(1)
  })
})
