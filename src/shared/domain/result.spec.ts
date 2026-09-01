import { describe, expect, it } from 'vitest'
import { Err, Ok, type Result } from './result'

describe('Result', () => {
  it('Ok is recognised as ok and carries its value', () => {
    const result = Ok(42)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toBe(42)
  })

  it('Err is not ok and carries its error', () => {
    const cause = new Error('boom')
    const result = Err(cause)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toBe(cause)
  })

  it('narrows to the value type on the ok branch', () => {
    const parse = (raw: string): Result<number, string> => {
      const value = Number(raw)
      return Number.isNaN(value) ? Err(`not a number: ${raw}`) : Ok(value)
    }

    expect(parse('7')).toEqual({ ok: true, value: 7 })
    expect(parse('x')).toEqual({ ok: false, error: 'not a number: x' })
  })
})
