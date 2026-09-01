import { describe, expect, it, vi } from 'vitest'
import { MigrationError, runMigrations, type StoreMigration } from './migrations'

const CHAIN: readonly StoreMigration[] = [
  { from: 1, migrate: (raw) => ({ ...raw, a: 'from-1' }) },
  { from: 2, migrate: (raw) => ({ ...raw, b: 'from-2' }) }
]

describe('runMigrations', () => {
  it('returns a current file untouched, by reference', () => {
    const raw = { version: 3, kept: true }

    const outcome = runMigrations(raw, CHAIN, 3)

    expect(outcome).toEqual({ raw, fromVersion: 3, migrated: false })
    expect(outcome.raw).toBe(raw)
  })

  it('composes a two-step chain in order and stamps each version', () => {
    const outcome = runMigrations({ version: 1, kept: true }, CHAIN, 3)

    expect(outcome.raw).toEqual({ version: 3, kept: true, a: 'from-1', b: 'from-2' })
    expect(outcome.fromVersion).toBe(1)
    expect(outcome.migrated).toBe(true)
  })

  it('stamps the version even when a step forgets to', () => {
    const forgetful: StoreMigration[] = [{ from: 1, migrate: () => ({}) }]

    expect(runMigrations({ version: 1 }, forgetful, 2).raw).toEqual({ version: 2 })
  })

  it('never mutates the input', () => {
    const raw = { version: 1, kept: true }

    runMigrations(raw, CHAIN, 3)

    expect(raw).toEqual({ version: 1, kept: true })
  })

  it('refuses a gap in the chain before running any step', () => {
    const spy = vi.fn((raw: Record<string, unknown>) => raw)
    const gapped: StoreMigration[] = [{ from: 2, migrate: spy }]

    expect(() => runMigrations({ version: 1 }, gapped, 3)).toThrow(MigrationError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('wraps a throwing step in MigrationError', () => {
    const broken: StoreMigration[] = [
      {
        from: 1,
        migrate: () => {
          throw new Error('boom')
        }
      }
    ]

    expect(() => runMigrations({ version: 1 }, broken, 2)).toThrow(MigrationError)
    expect(() => runMigrations({ version: 1 }, broken, 2)).toThrow(/from version 1.*boom/)
  })

  it('refuses a future version — the carve-out must handle it first', () => {
    expect(() => runMigrations({ version: 4 }, CHAIN, 3)).toThrow(MigrationError)
  })

  it('refuses a file with no readable version', () => {
    for (const version of [undefined, null, '1', 0, 1.5, -1]) {
      expect(() => runMigrations({ version }, CHAIN, 3)).toThrow(MigrationError)
    }
  })
})
