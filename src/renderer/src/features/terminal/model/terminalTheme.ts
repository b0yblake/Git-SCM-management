import type { ITheme } from '@xterm/xterm'

/**
 * The terminal's palette — GitHub Primer dark, the same language the rest of
 * the app speaks after Phase 23.
 *
 * Two reasons this is a module rather than a constant inside `TerminalView`.
 * `background` has to equal the CSS `--surface`: the pane body, the xterm
 * canvas and the window's pre-paint colour are all the same surface, and any
 * disagreement shows as a seam around every terminal. `tokens.spec.ts` pins it
 * to the stylesheet, which it can only do if the value is importable.
 *
 * The sixteen ANSI entries were previously left to xterm's built-in defaults,
 * so shell output was lit by a palette unrelated to the application around it
 * (its green was #0dbc79 against the app's #3fb950).
 */
export const TERMINAL_THEME = {
  background: '#0d1117',
  foreground: '#f0f6fc',
  cursor: '#f0f6fc',
  cursorAccent: '#0d1117',
  // The one 8-digit value: xterm takes the selection's alpha in the hex
  // itself, having no separate opacity option for it.
  selectionBackground: '#388bfd66',

  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',

  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc'
} as const satisfies ITheme
