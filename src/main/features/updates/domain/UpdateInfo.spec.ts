import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseReleaseTag, parseVersion, releaseUrlFor } from './UpdateInfo'

describe('parseVersion', () => {
  it('accepts exactly x.y.z with no decoration', () => {
    expect(parseVersion('0.1.0')).toEqual([0, 1, 0])
    expect(parseVersion('10.20.30')).toEqual([10, 20, 30])
  })

  it('rejects everything else', () => {
    for (const bad of ['v0.1.0', '0.1', '0.1.0.0', '0.1.0-beta', '01.0.0', '', 'latest']) {
      expect(parseVersion(bad)).toBeNull()
    }
  })
})

describe('parseReleaseTag', () => {
  it('strips the v prefix from a well-formed tag', () => {
    expect(parseReleaseTag('v0.2.0')).toBe('0.2.0')
  })

  it('rejects a tag without the prefix or with a garbled version', () => {
    for (const bad of ['0.2.0', 'v0.2', 'version-2', 'v0.2.0-rc.1', 'v']) {
      expect(parseReleaseTag(bad)).toBeNull()
    }
  })
})

describe('isNewerVersion', () => {
  it('compares numerically, component by component', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
    // Numeric, not lexicographic — the classic trap.
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true)
  })

  it('equal or older is never "newer"', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false)
  })

  it('unparseable input is never "newer" — no prompt from garbage', () => {
    expect(isNewerVersion('banana', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.2.0', 'banana')).toBe(false)
  })
})

describe('releaseUrlFor', () => {
  it('mints the one URL the app may open, from a validated version', () => {
    expect(releaseUrlFor('0.2.0')).toBe(
      'https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.2.0'
    )
  })
})
