import { describe, expect, it } from 'vitest'

/**
 * Guards the vitest project split (TESTING.md §3). If these fail, tests are
 * running somewhere other than where their code ships.
 */
describe('main test project', () => {
  it('runs in the node environment', () => {
    expect(typeof process).toBe('object')
    expect(process.versions.node).toBeDefined()
  })

  it('has no DOM', () => {
    expect('document' in globalThis).toBe(false)
    expect('window' in globalThis).toBe(false)
  })
})
