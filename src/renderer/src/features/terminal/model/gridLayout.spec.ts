import { describe, expect, it } from 'vitest'
import { computeGridTemplate } from './gridLayout'

describe('computeGridTemplate', () => {
  it('keeps the classic 2×2 for up to four tiles', () => {
    for (const tiles of [1, 2, 3, 4]) {
      expect(computeGridTemplate(tiles, 1600, 900)).toEqual({ columns: 2, rows: 2 })
    }
  })

  it('balances a landscape canvas toward 16:9 cells', () => {
    expect(computeGridTemplate(5, 1600, 900)).toEqual({ columns: 3, rows: 2 })
    expect(computeGridTemplate(6, 1600, 900)).toEqual({ columns: 3, rows: 2 })
    expect(computeGridTemplate(7, 1600, 900)).toEqual({ columns: 3, rows: 3 })
    expect(computeGridTemplate(9, 1600, 900)).toEqual({ columns: 3, rows: 3 })
    expect(computeGridTemplate(10, 1600, 900)).toEqual({ columns: 4, rows: 3 })
  })

  it('stacks full-width strips on a portrait canvas', () => {
    expect(computeGridTemplate(5, 900, 1600)).toEqual({ columns: 1, rows: 5 })
    expect(computeGridTemplate(6, 900, 1600)).toEqual({ columns: 1, rows: 6 })
  })

  it('spreads across an ultrawide canvas', () => {
    expect(computeGridTemplate(6, 3440, 900)).toEqual({ columns: 3, rows: 2 })
  })

  it('falls back to a square-ish lattice while the canvas is unmeasured', () => {
    expect(computeGridTemplate(6, 0, 0)).toEqual({ columns: 3, rows: 2 })
    expect(computeGridTemplate(9, Number.NaN, 900)).toEqual({ columns: 3, rows: 3 })
  })

  it('never loses a tile: columns × rows covers every count', () => {
    for (let tiles = 1; tiles <= 24; tiles += 1) {
      const { columns, rows } = computeGridTemplate(tiles, 1600, 900)
      expect(columns * rows).toBeGreaterThanOrEqual(tiles)
    }
  })
})
