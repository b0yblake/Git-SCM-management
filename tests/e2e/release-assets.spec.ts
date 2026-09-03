import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * What `npm run package` must leave behind for a release to be cuttable.
 *
 * Phase 11 proves the packaged app runs; this proves the *files* are the ones
 * the release workflow will upload. Both halves matter for the same reason:
 * a release is assembled by a machine nobody is watching, so anything the
 * build renames, drops or silently half-produces has to fail here instead of
 * on the release page.
 *
 * No app is launched — these are assertions about build output.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const RELEASE = join(ROOT, 'release')

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string
}

const EXE = `GitDeck-Setup-${version}-x64.exe`
const MSI = `GitDeck-Setup-${version}-x64.msi`
const CHECKSUMS = `GitDeck-${version}-checksums.txt`

const sizeOf = (name: string): number => statSync(join(RELEASE, name)).size

test.describe('the release assets', () => {
  test('the three uploadable files exist', () => {
    for (const name of [EXE, MSI, CHECKSUMS]) {
      expect(existsSync(join(RELEASE, name)), `run \`npm run package\` first — ${name}`).toBe(true)
    }
  })

  /**
   * The workflow names its uploads as literal paths. If `artifactName` changes
   * and the workflow does not (or the other way round), the build stays green
   * and the release step fails at the one moment nothing can be retried,
   * because the tag is already published and immutable.
   */
  test('the release workflow uploads exactly what the build produced', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8')

    const uploads = [...workflow.matchAll(/"release\/([^"#]+)#/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1].replaceAll('$v', version)]
    )

    expect(uploads).toEqual([CHECKSUMS, EXE, MSI])
    for (const name of uploads) {
      expect(existsSync(join(RELEASE, name)), name).toBe(true)
    }
  })

  /**
   * `sha256sum -c` format, and the hashes have to be of these actual bytes —
   * a checksums file that agrees with itself but not with the installer is
   * worse than none, because it looks like verification.
   */
  test('every checksum recomputes from the file it names', () => {
    const lines = readFileSync(join(RELEASE, CHECKSUMS), 'utf8').trim().split('\n')

    expect(lines).toHaveLength(2)

    for (const line of lines) {
      expect(line).toMatch(/^[0-9a-f]{64} {2}GitDeck-Setup-.+\.(exe|msi)$/)

      const [hash, name] = line.split('  ')
      const actual = createHash('sha256')
        .update(readFileSync(join(RELEASE, name as string)))
        .digest('hex')

      expect(actual, name).toBe(hash)
    }

    expect(lines.map((line) => line.split('  ')[1])).toEqual([EXE, MSI])
  })

  /**
   * The MSI wraps the NSIS installer rather than repackaging the app, so the
   * failure to catch is an MSI that built successfully around nothing: the
   * wrapper's own product is deliberately empty, and an MSI missing its
   * embedded payload is only a few hundred KB.
   */
  test('the MSI is a real installer package that embeds the EXE', () => {
    const path = join(RELEASE, MSI)
    const head = Buffer.alloc(8)
    const file = openSync(path, 'r')
    try {
      readSync(file, head, 0, 8, 0)
    } finally {
      closeSync(file)
    }

    // OLE2 compound-file magic — what every .msi starts with.
    expect(head.toString('hex')).toBe('d0cf11e0a1b11ae1')
    expect(sizeOf(MSI)).toBeGreaterThan(sizeOf(EXE) - 1_000_000)
  })
})
