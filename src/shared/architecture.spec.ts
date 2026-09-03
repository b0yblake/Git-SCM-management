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

/**
 * The ways this application can reach outside itself: the network, the user's
 * browser, and another OS process. Checkpoint C promotes these from a manual
 * "repository scan" — which Phases 12 and 16 each ticked once, by hand, and
 * which said nothing on every commit after — to an allow-list that has to be
 * edited deliberately.
 *
 * Comments are stripped first, so prose mentioning `fetch` or `child_process`
 * cannot widen the list, and a real call cannot hide inside one.
 */
describe('outward call sites', () => {
  /** Production source: doubles included, specs excluded — a spec may spawn. */
  const files = sourceFiles(SRC).filter((file) => !/\.spec\.tsx?$/.test(file))

  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  const code = (file: string): string => stripComments(readFileSync(file, 'utf8'))

  const matching = (pattern: RegExp): string[] =>
    files
      .filter((file) => pattern.test(code(file)))
      .map(show)
      .sort()

  const NETWORK = /(^|[^.\w])fetch([^\w]|$)|net\.request|XMLHttpRequest|WebSocket|sendBeacon/
  const BROWSER = /^import \{[^}]*\bshell\b[^}]*\} from 'electron'/m
  const PROCESS = /from '(node:)?child_process'/

  it('scans a meaningful number of production files', () => {
    expect(files.length).toBeGreaterThan(25)
  })

  it('recognises an outward call when it sees one', () => {
    // Guards the guard, and pins what comment-stripping must not swallow.
    expect(NETWORK.test('const r = await fetch(url)')).toBe(true)
    expect(NETWORK.test('fetchFn(url)')).toBe(false)
    expect(BROWSER.test("import { shell } from 'electron'")).toBe(true)
    expect(PROCESS.test("import { execFile } from 'node:child_process'")).toBe(true)
    expect(stripComments('// fetch\n/* child_process */\nconst x = 1')).not.toMatch(
      /fetch|child_process/
    )
  })

  it('reaches the network from one file only', () => {
    // Phase 16: one anonymous, bounded, pinned-URL GET and nothing else. The
    // renderer has no network surface at all.
    expect(matching(NETWORK)).toEqual([
      'main/features/updates/infrastructure/GitHubReleaseClient.ts'
    ])
  })

  it('holds Electron shell in the composition root only', () => {
    // `shell.openExternal` sends a URL to the user's browser. Both holders
    // pass a URL the application minted: createWindow denies a second window
    // and forwards the link it was handed, registerIpc injects the opener
    // into the updates handler, which only ever passes its own minted release
    // URL. No IPC channel accepts a URL from the renderer.
    expect(matching(BROWSER)).toEqual([
      'main/bootstrap/createWindow.ts',
      'main/bootstrap/registerIpc.ts'
    ])
  })

  it('starts an OS process from three files only', () => {
    // Phase 12's rule generalised: process creation is an infrastructure
    // concern with a named owner. node-pty has its own case above.
    expect(matching(PROCESS)).toEqual([
      'main/bootstrap/explorerMenu.ts',
      'main/features/git/infrastructure/GitCliAdapter.ts',
      'main/features/ports/infrastructure/WindowsPortAdapter.ts'
    ])
  })
})
