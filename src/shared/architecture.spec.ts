import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the feature boundary rule (ARCHITECTURE.md §4): a feature's
 * internals are private, and everyone else goes through its `public.ts`.
 *
 * This is a test rather than a lint rule because the rule is about the
 * *resolved* target, and an import can reach a feature as `../../terminal/...`
 * or as `@main/features/terminal/...`. Matching specifier strings would miss
 * one of those shapes; resolving them cannot.
 */
const SRC = resolve(import.meta.dirname, '..')

const ALIASES: Record<string, string> = {
  '@shared': join(SRC, 'shared'),
  '@main': join(SRC, 'main'),
  '@preload': join(SRC, 'preload'),
  '@renderer': join(SRC, 'renderer', 'src')
}

/** Directories whose immediate children are features. */
const FEATURE_ROOTS = [join(SRC, 'main', 'features'), join(SRC, 'renderer', 'src', 'features')]

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => match[1] ?? '')

/** Absolute path an import points at, or null when it leaves the source tree. */
const resolveSpecifier = (file: string, specifier: string): string | null => {
  if (specifier.startsWith('.')) return resolve(dirname(file), specifier)

  for (const [alias, target] of Object.entries(ALIASES)) {
    if (specifier === alias) return target
    if (specifier.startsWith(`${alias}/`)) return join(target, specifier.slice(alias.length + 1))
  }
  return null
}

/** The feature directory owning a path, or null when it belongs to no feature. */
const featureOf = (path: string): string | null => {
  for (const root of FEATURE_ROOTS) {
    if (!path.startsWith(root + sep)) continue
    const name = path.slice(root.length + 1).split(sep)[0]
    if (name) return join(root, name)
  }
  return null
}

const show = (path: string): string => relative(SRC, path).split(sep).join('/')

describe('feature boundaries', () => {
  const files = sourceFiles(SRC)

  it('scans a meaningful number of files', () => {
    // Guards the guard: a broken walk would make everything below vacuous.
    expect(files.length).toBeGreaterThan(25)
  })

  it('reaches into a feature only through its public.ts', () => {
    const violations: string[] = []

    for (const file of files) {
      const owner = featureOf(file)

      for (const specifier of importsOf(file)) {
        const target = resolveSpecifier(file, specifier)
        if (!target) continue

        const targetOwner = featureOf(target)
        if (!targetOwner || targetOwner === owner) continue

        if (target !== join(targetOwner, 'public')) {
          violations.push(`${show(file)} → ${specifier}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('recognises a cross-feature internal import when it sees one', () => {
    // Proves the resolver above actually classifies, rather than always
    // returning "fine" — the failure mode that makes an audit worthless.
    const pretendFile = join(SRC, 'main', 'features', 'workspace', 'domain', 'Workspace.ts')
    const internal = resolveSpecifier(pretendFile, '../../terminal/application/TerminalManager')
    const viaPublic = resolveSpecifier(pretendFile, '../../terminal/public')
    const aliased = resolveSpecifier(pretendFile, '@main/features/terminal/domain/PtyProcess')

    expect(featureOf(pretendFile)).toBe(join(SRC, 'main', 'features', 'workspace'))
    expect(internal).not.toBe(join(featureOf(internal!)!, 'public'))
    expect(viaPublic).toBe(join(featureOf(viaPublic!)!, 'public'))
    expect(featureOf(aliased!)).toBe(join(SRC, 'main', 'features', 'terminal'))
  })
})

describe('layer boundaries not covered by lint', () => {
  const files = sourceFiles(SRC)

  it('keeps every node-pty import inside terminal infrastructure', () => {
    const offenders = files
      .filter((file) => /from\s+['"]node-pty['"]/.test(readFileSync(file, 'utf8')))
      .map(show)

    expect(offenders).toEqual(['main/features/terminal/infrastructure/NodePtyAdapter.ts'])
  })

  it('keeps Electron out of the renderer entirely', () => {
    const offenders = files
      .filter((file) => file.startsWith(join(SRC, 'renderer')))
      .filter((file) => /from\s+['"]electron['"]/.test(readFileSync(file, 'utf8')))
      .map(show)

    expect(offenders).toEqual([])
  })

  it('keeps filesystem access inside infrastructure', () => {
    // Domain and application are pure use-case code (ARCHITECTURE.md §2). A
    // `node:fs` import there means storage leaked out of the adapter that owns
    // it, which is exactly how a workspace ends up half-persisted by a service.
    const layered = files.filter((file) =>
      /[\\/]features[\\/][^\\/]+[\\/](domain|application)[\\/]/.test(file)
    )
    const importsFs = (file: string): boolean =>
      /from\s+['"]node:fs['"]/.test(readFileSync(file, 'utf8'))

    // Guards the guard: the pattern must select real files, and must detect an
    // fs import where one genuinely exists.
    expect(layered.length).toBeGreaterThan(10)
    expect(
      importsFs(join(SRC, 'main', 'features', 'settings', 'infrastructure', 'JsonSettingsStore.ts'))
    ).toBe(true)

    expect(layered.filter(importsFs).map(show)).toEqual([])
  })

  it('exposes a public.ts for every feature', () => {
    const missing = FEATURE_ROOTS.flatMap((root) =>
      readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter(
          (entry) =>
            !sourceFiles(join(root, entry.name)).includes(join(root, entry.name, 'public.ts'))
        )
        .map((entry) => show(join(root, entry.name)))
    )

    expect(missing).toEqual([])
  })
})
