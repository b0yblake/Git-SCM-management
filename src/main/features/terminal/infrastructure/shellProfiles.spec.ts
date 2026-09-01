import { describe, expect, it } from 'vitest'
import { ShellNotFoundError } from '../domain/errors'
import { fakeShellProfile, fakeShellRegistry } from '../testing/FakeShellDetector'
import { createShellRegistry, pickDefaultShellProfileId } from './shellProfiles'

describe('createShellRegistry', () => {
  it('reports what detection found, in the order it found it', () => {
    const registry = fakeShellRegistry('git-bash', 'cmd')

    expect(registry.available().map((profile) => profile.id)).toEqual(['git-bash', 'cmd'])
  })

  it('resolves an installed profile to its launch command', () => {
    const registry = createShellRegistry([
      { id: 'git-bash', label: 'Git Bash', file: 'C:/Git/bash.exe', args: ['--login', '-i'] }
    ])

    expect(registry.resolve('git-bash')).toEqual({
      file: 'C:/Git/bash.exe',
      args: ['--login', '-i']
    })
  })

  it('raises ShellNotFoundError for a profile that is not installed', () => {
    const registry = fakeShellRegistry('cmd')

    expect(() => registry.resolve('pwsh')).toThrow(ShellNotFoundError)
  })

  it('raises ShellNotFoundError when nothing is installed', () => {
    const registry = createShellRegistry([])

    expect(() => registry.resolve('cmd')).toThrow(ShellNotFoundError)
    expect(registry.available()).toEqual([])
  })

  it('names the profile in the error so the message is actionable', () => {
    const registry = fakeShellRegistry('cmd')

    expect(() => registry.resolve('wsl')).toThrow(/wsl/)
  })

  it('answers has() without throwing', () => {
    const registry = fakeShellRegistry('cmd')

    expect(registry.has('cmd')).toBe(true)
    expect(registry.has('pwsh')).toBe(false)
  })
})

describe('pickDefaultShellProfileId', () => {
  it('honours the user preference when it is installed', () => {
    const registry = fakeShellRegistry('git-bash', 'cmd')

    expect(pickDefaultShellProfileId(registry, 'cmd')).toBe('cmd')
  })

  /** A shell can be uninstalled between runs; that must not block a terminal. */
  it('falls back to the first available profile when the preference is gone', () => {
    const registry = fakeShellRegistry('git-bash', 'cmd')

    expect(pickDefaultShellProfileId(registry, 'pwsh')).toBe('git-bash')
  })

  it('falls back when no preference has been expressed', () => {
    const registry = fakeShellRegistry('powershell', 'cmd')

    expect(pickDefaultShellProfileId(registry, null)).toBe('powershell')
  })

  it('returns null when the machine has no supported shell', () => {
    expect(pickDefaultShellProfileId(createShellRegistry([]), 'cmd')).toBeNull()
    expect(pickDefaultShellProfileId(createShellRegistry([]), null)).toBeNull()
  })
})

describe('the fake registry used by other suites', () => {
  it('produces a complete profile for every id', () => {
    expect(fakeShellProfile('wsl')).toEqual({
      id: 'wsl',
      label: 'WSL',
      file: 'C:/fake/wsl.exe',
      args: []
    })
  })
})
