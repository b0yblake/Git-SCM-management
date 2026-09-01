import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { detectShellProfiles, type PathProbe } from './WindowsShellDetector'

/**
 * A realistic Windows environment. Detection is driven entirely through the
 * injected probe, so this suite passes on a machine with none of these shells
 * installed — including CI.
 */
const ENV = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local'
}

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe'
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
const CMD = 'C:\\Windows\\System32\\cmd.exe'
const WSL = 'C:\\Windows\\System32\\wsl.exe'

let logger: FakeLogger

const detect = (installed: string[], probe?: PathProbe) =>
  detectShellProfiles({
    probe: probe ?? ((path) => installed.includes(path)),
    env: ENV,
    logger
  })

beforeEach(() => {
  logger = createFakeLogger()
})

describe('what it reports', () => {
  it('reports only the shells the probe says are present', () => {
    const found = detect([GIT_BASH, CMD])

    expect(found.map((profile) => profile.id)).toEqual(['git-bash', 'cmd'])
  })

  it('resolves each profile to its executable and arguments', () => {
    const [gitBash] = detect([GIT_BASH])

    expect(gitBash).toEqual({
      id: 'git-bash',
      label: 'Git Bash',
      file: GIT_BASH,
      args: ['--login', '-i']
    })
  })

  it('carries a human label for every detected profile', () => {
    const found = detect([GIT_BASH, POWERSHELL, PWSH, CMD, WSL])

    expect(found.map((profile) => profile.label)).toEqual([
      'Git Bash',
      'Windows PowerShell',
      'PowerShell 7',
      'Command Prompt',
      'WSL'
    ])
  })

  it('keeps a stable order so the picker does not reshuffle between launches', () => {
    const all = [GIT_BASH, POWERSHELL, PWSH, CMD, WSL]

    expect(detect(all).map((p) => p.id)).toEqual(detect(all).map((p) => p.id))
    expect(detect(all).map((p) => p.id)).toEqual(['git-bash', 'powershell', 'pwsh', 'cmd', 'wsl'])
  })
})

describe('Git Bash install locations', () => {
  it.each([
    ['Program Files', GIT_BASH],
    ['Program Files (x86)', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
    ['a per-user install', 'C:\\Users\\dev\\AppData\\Local\\Programs\\Git\\bin\\bash.exe']
  ])('finds it in %s', (_label, path) => {
    const [profile] = detect([path])

    expect(profile?.id).toBe('git-bash')
    expect(profile?.file).toBe(path)
  })

  it('prefers Program Files when several installs exist', () => {
    const [profile] = detect([GIT_BASH, 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'])

    expect(profile?.file).toBe(GIT_BASH)
  })
})

describe('absence is not an error', () => {
  it('omits an uninstalled profile without throwing', () => {
    const found = detect([POWERSHELL])

    expect(found.map((profile) => profile.id)).toEqual(['powershell'])
    expect(found.some((profile) => profile.id === 'pwsh')).toBe(false)
  })

  it('returns an empty list when nothing is installed', () => {
    expect(detect([])).toEqual([])
  })

  it('survives an environment with no variables set at all', () => {
    const found = detectShellProfiles({ probe: () => true, env: {}, logger })

    // Every candidate path needs an env var, so none can even be built.
    expect(found).toEqual([])
  })
})

describe('a failing probe', () => {
  it('skips only the candidate it failed on, and logs it', () => {
    const found = detect([], (path) => {
      if (path.includes('Git')) throw new Error('EPERM')
      return path === CMD
    })

    expect(found.map((profile) => profile.id)).toEqual(['cmd'])
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('still returns the others when every Git path throws', () => {
    const found = detect([], (path) => {
      if (path.includes('Git')) throw new Error('EPERM')
      return [POWERSHELL, CMD].includes(path)
    })

    expect(found.map((profile) => profile.id)).toEqual(['powershell', 'cmd'])
  })
})

describe('logging', () => {
  it('records what it found', () => {
    detect([CMD])

    const summary = logger.entriesAt('info').find((entry) => entry.message.includes('detection'))
    expect(summary?.meta).toEqual({ available: ['cmd'] })
  })

  it('never logs the environment it was given', () => {
    detect([CMD])

    expect(JSON.stringify(logger.entries)).not.toContain('AppData')
  })
})
