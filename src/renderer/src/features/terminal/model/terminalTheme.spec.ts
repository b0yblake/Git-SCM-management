import { describe, expect, it } from 'vitest'
import { TERMINAL_THEME } from './terminalTheme'

/**
 * The palette's shape. Whether it agrees with the CSS token block is a
 * cross-file question, and `src/shared/tokens.spec.ts` answers it — a renderer
 * spec has no filesystem, by design.
 */
describe('the terminal palette', () => {
  it('gives xterm all sixteen ANSI slots as plain six-digit hex', () => {
    // prettier-ignore
    const ansi = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
      'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
    ] as const

    for (const slot of ansi) {
      expect(TERMINAL_THEME[slot], slot).toMatch(/^#[0-9a-f]{6}$/)
    }
    // Sixteen distinct colours: a duplicate would make two ANSI codes
    // indistinguishable in shell output that relies on them.
    expect(new Set(ansi.map((slot) => TERMINAL_THEME[slot])).size).toBe(16)
  })

  it('carries the selection alpha in the hex, the only way xterm accepts it', () => {
    expect(TERMINAL_THEME.selectionBackground).toMatch(/^#[0-9a-f]{8}$/)
  })

  it('sets the cursor against its own background, so it stays visible', () => {
    expect(TERMINAL_THEME.cursor).not.toBe(TERMINAL_THEME.background)
    expect(TERMINAL_THEME.cursorAccent).toBe(TERMINAL_THEME.background)
  })
})
