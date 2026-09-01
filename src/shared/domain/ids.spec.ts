import { describe, expect, it } from 'vitest'
import { createId, isId } from './ids'

describe('createId', () => {
  it('generates 1000 unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId('term')))

    expect(ids.size).toBe(1000)
  })

  it('matches the documented `<prefix>_<uuid>` format', () => {
    const id = createId('term')

    expect(id).toMatch(/^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(isId(id)).toBe(true)
  })

  it('keeps the prefix so an id says what it identifies', () => {
    expect(createId('ws').startsWith('ws_')).toBe(true)
    expect(createId('term').startsWith('term_')).toBe(true)
  })

  it('rejects strings that are not ids', () => {
    expect(isId('term')).toBe(false)
    expect(isId('term_not-a-uuid')).toBe(false)
    expect(isId('')).toBe(false)
  })
})
