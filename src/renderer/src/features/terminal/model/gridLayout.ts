/** Target cell shape for the elastic Grid (Phase 21). */
export const GRID_CELL_ASPECT = 16 / 9

export interface GridTemplate {
  readonly columns: number
  readonly rows: number
}

const CLASSIC_GRID: GridTemplate = { columns: 2, rows: 2 }

/**
 * Picks the lattice that shows `tileCount` tiles on one page.
 *
 * Up to four tiles the classic 2×2 Grid stands. Above that, every
 * column count is scored by the largest 16:9 rectangle that fits one
 * cell — cells still stretch to fill (terminals want area), so the
 * ratio steers the arrangement rather than letterboxing panes. Ties go
 * to more columns: shallow rows read better for terminal output.
 *
 * An unmeasured canvas (first paint, jsdom) falls back to the
 * square-ish `ceil(√tiles)` lattice.
 */
export const computeGridTemplate = (
  tileCount: number,
  width: number,
  height: number
): GridTemplate => {
  const tiles = Math.max(1, Math.floor(tileCount))
  if (tiles <= 4) return CLASSIC_GRID

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    const columns = Math.ceil(Math.sqrt(tiles))
    return { columns, rows: Math.ceil(tiles / columns) }
  }

  let best: GridTemplate = { columns: 1, rows: tiles }
  let bestScore = -1
  for (let columns = 1; columns <= tiles; columns += 1) {
    const rows = Math.ceil(tiles / columns)
    // A lattice whose last column would sit fully empty is the same
    // layout as one with fewer columns — skip it.
    if ((columns - 1) * rows >= tiles) continue

    const cellWidth = width / columns
    const cellHeight = height / rows
    const score = Math.min(cellWidth, cellHeight * GRID_CELL_ASPECT)
    // The tolerance keeps mathematically equal scores (differing by one
    // float bit) counting as the tie they are.
    if (score >= bestScore * (1 - 1e-6)) {
      best = { columns, rows }
      bestScore = score
    }
  }
  return best
}
