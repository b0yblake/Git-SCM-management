import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The design system, audited as text (Phase 23).
 *
 * `TESTING.md` §7 forbids snapshots of rendered UI, and jsdom lays out no CSS
 * anyway — so the stylesheets are checked the way `architecture.spec.ts`
 * checks source: for the invariants a reviewer would otherwise confirm by eye,
 * and never notice slipping. It lives beside that file, and for the same
 * reason: a repository-wide audit belongs to no one feature, and the shared
 * specs are the ones typechecked with node APIs available.
 *
 * Every helper is proved on a planted input before it is trusted. A scanner
 * that quietly matches nothing passes every audit it is ever given.
 */
const STYLES = join(import.meta.dirname, '../renderer/src/shared/styles')
const SHEETS = ['global.css', 'terminal.css', 'workspace.css', 'ports.css', 'git.css']

const read = (sheet: string): string => readFileSync(join(STYLES, sheet), 'utf8')

/** Comments carry the replaced hex values as prose; they document, not style. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The token block — the one place a colour may be written down. */
const rootBlock = (): string => {
  const match = /:root\s*\{([\s\S]*?)\n\}/.exec(stripComments(read('global.css')))
  if (!match?.[1]) throw new Error('global.css has no :root block')
  return match[1]
}

const withoutRoot = (css: string): string =>
  stripComments(css).replace(/:root\s*\{[\s\S]*?\n\}/, '')

/**
 * Declaration values. Selectors survive as harmless pairs — `.item:hover`
 * reads as a value of "hover" — which is fine, because only values are
 * searched. That is also why a property called `white-space` can never be
 * mistaken for the colour white.
 */
const values = (css: string): string[] =>
  [...css.matchAll(/[-a-z]+\s*:\s*([^;{}]+)/gi)].map((match) => (match[1] ?? '').trim())

/** Words that name a colour slot without being a colour. */
const NOT_A_COLOUR = new Set(['transparent', 'currentcolor', 'inherit', 'none', 'unset', 'initial'])

// prettier-ignore
const NAMED = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'gray', 'grey',
  'silver', 'navy', 'teal', 'olive', 'maroon', 'lime', 'aqua', 'cyan', 'magenta', 'fuchsia',
  'pink', 'brown', 'gold', 'tan', 'violet', 'indigo', 'coral', 'crimson', 'salmon', 'khaki',
  'plum', 'orchid', 'turquoise', 'wheat', 'snow', 'ivory', 'beige', 'azure', 'lavender'
])

const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i
const HEX = /#[0-9a-f]{3,8}\b/gi

const findColourLiterals = (css: string): string[] => {
  const found: string[] = []

  for (const value of values(css)) {
    found.push(...(value.match(HEX) ?? []))
    if (COLOUR_FUNCTION.test(value)) found.push(value)

    for (const word of value.toLowerCase().split(/[\s,()/]+/)) {
      if (word && !NOT_A_COLOUR.has(word) && NAMED.has(word)) found.push(word)
    }
  }

  return found
}

const channel = (hex: string, at: number): number => {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x: relative luminance, then the ratio between two opaque colours. */
const contrast = (a: string, b: string): number => {
  const luminance = (hex: string): number =>
    0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Opaque tokens only: a translucent value has no contrast of its own. */
const opaqueTokens = (): Record<string, string> =>
  Object.fromEntries(
    [...rootBlock().matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').toLowerCase()
    ])
  )

describe('the helpers this suite trusts', () => {
  it('finds a planted colour in every form it could be written', () => {
    expect(findColourLiterals('a { color: #fff; }')).toEqual(['#fff'])
    expect(findColourLiterals('a { background: #0d1117; }')).toEqual(['#0d1117'])
    expect(findColourLiterals('a { background: rgb(255 255 255 / 3%); }')).toHaveLength(1)
    expect(findColourLiterals('a { color: white; }')).toEqual(['white'])
    expect(findColourLiterals('a { border-color: hsl(210 5% 50%); }')).toHaveLength(1)
  })

  it('passes what is not a colour, including the words that read like one', () => {
    expect(
      findColourLiterals(`a {
        color: transparent;
        stroke: currentColor;
        font: inherit;
        fill: none;
        white-space: nowrap;
        background: var(--surface);
        box-shadow: inset 2px 0 var(--accent);
        background: color-mix(in srgb, var(--danger) 18%, var(--danger-surface));
      }`)
    ).toEqual([])
  })

  it('treats a colour inside a comment as prose', () => {
    expect(
      findColourLiterals(stripComments('/* was #202020 */\na { color: var(--text); }'))
    ).toEqual([])
  })

  it('computes the reference contrast ratios', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('reads the token block, and only its opaque entries', () => {
    const tokens = opaqueTokens()

    expect(tokens['--surface']).toBe('#0d1117')
    expect(Object.keys(tokens).length).toBeGreaterThan(15)
    // Translucent roles are declared, but must never be offered for contrast.
    expect(tokens['--surface-hover']).toBeUndefined()
    expect(tokens['--accent-surface']).toBeUndefined()
  })
})

describe('every colour lives in the token block', () => {
  it('reads all five stylesheets', () => {
    // Guards the guard: a wrong path would make every assertion below vacuous.
    for (const sheet of SHEETS) expect(read(sheet).length).toBeGreaterThan(500)
  })

  for (const sheet of SHEETS) {
    it(`${sheet} declares no colour of its own`, () => {
      expect(findColourLiterals(withoutRoot(read(sheet)))).toEqual([])
    })
  }
})

describe('every token referenced is declared', () => {
  it('names no variable the block does not define', () => {
    const declared = new Set(
      [...rootBlock().matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1])
    )
    const missing: string[] = []

    for (const sheet of SHEETS) {
      for (const match of stripComments(read(sheet)).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        if (!declared.has(match[1])) missing.push(`${sheet} → ${match[1]}`)
      }
    }

    // A typo resolves to nothing at all: the declaration is dropped and the
    // element renders unstyled, with no error anywhere.
    expect(missing).toEqual([])
    expect(declared.size).toBeGreaterThan(30)
  })
})

describe('contrast', () => {
  const tokens = opaqueTokens()
  const at = (name: string): string => {
    const value = tokens[name]
    if (!value) throw new Error(`${name} is not an opaque token`)
    return value
  }

  const failures = (
    foregrounds: readonly string[],
    backgrounds: readonly string[],
    floor: number
  ): string[] =>
    foregrounds.flatMap((fg) =>
      backgrounds
        .map((bg) => ({ pair: `${fg} on ${bg}`, ratio: contrast(at(fg), at(bg)) }))
        .filter((result) => result.ratio < floor)
        .map((result) => `${result.pair} = ${result.ratio.toFixed(2)}`)
    )

  const SURFACES = ['--surface', '--surface-raised', '--surface-sunken'] as const

  it('reads body and secondary text on every surface at AA', () => {
    expect(
      failures(['--text', '--text-muted'], [...SURFACES, '--surface-control', '--surface-overlay'], 4.5)
    ).toEqual([])
  })

  it('reads every status colour on every surface at AA', () => {
    expect(
      failures(['--accent-strong', '--success', '--warning', '--danger'], SURFACES, 4.5)
    ).toEqual([])
  })

  it('reads the label on a filled button at AA', () => {
    // White on the old accent fill was 3.75:1, which is why the primary action
    // is green now and the accent went back to being a state colour.
    expect(
      failures(['--text-on-emphasis'], ['--primary', '--accent', '--danger-emphasis'], 4.5)
    ).toEqual([])
  })

  it('draws a border that can actually be seen', () => {
    // Not a WCAG figure: 1.7 is the floor the old #25303c missed at 1.41 on
    // the canvas, which is what made panes, cards and inputs read as smudges.
    expect(failures(['--border'], ['--surface', '--surface-raised'], 1.7)).toEqual([])
  })

  it('draws a focus ring at the non-text threshold', () => {
    expect(failures(['--focus'], [...SURFACES, '--surface-control'], 3)).toEqual([])
  })
})

describe('the terminal is the canvas', () => {
  /**
   * xterm cannot read a CSS variable, so `--surface` exists a second time in
   * `terminalTheme.ts`. Read as text rather than imported: a shared spec must
   * not reach into a renderer feature (`architecture.spec.ts`), and text is
   * how that file makes the same kind of check.
   */
  const theme = readFileSync(
    join(import.meta.dirname, '../renderer/src/features/terminal/model/terminalTheme.ts'),
    'utf8'
  )
  const entry = (name: string): string | undefined =>
    new RegExp(`${name}:\\s*'(#[0-9a-f]{6,8})'`, 'i').exec(theme)?.[1]?.toLowerCase()

  it('finds the entries it is about to compare', () => {
    expect(entry('background')).toBeDefined()
    expect(entry('foreground')).toBeDefined()
  })

  it('paints the same surface the pane around it paints', () => {
    // Any disagreement shows as a seam around every terminal on screen.
    expect(entry('background')).toBe(opaqueTokens()['--surface'])
    expect(entry('cursorAccent')).toBe(opaqueTokens()['--surface'])
  })

  it('writes in the same ink, and shares its green and yellow', () => {
    expect(entry('foreground')).toBe(opaqueTokens()['--text'])
    expect(entry('cursor')).toBe(opaqueTokens()['--text'])
    expect(entry('green')).toBe(opaqueTokens()['--success'])
    expect(entry('yellow')).toBe(opaqueTokens()['--warning'])
  })
})

describe('motion', () => {
  it('is opt-out wherever it exists', () => {
    const animated = SHEETS.filter((sheet) => /\b(?:transition|animation)\s*:/.test(read(sheet)))

    if (animated.length > 0) {
      expect(read('global.css')).toContain('@media (prefers-reduced-motion: reduce)')
    }
    // Pins the fact, not its absence: the confirm dialog does animate.
    expect(animated).toContain('global.css')
  })
})
