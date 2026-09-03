/**
 * Writes the checksums file that ships as the first asset of a GitHub release.
 *
 * The format is what `sha256sum -c` reads — hash, two spaces, file name — so a
 * user can verify a download with a tool they already have rather than one this
 * project invented. It runs as the last step of `npm run package`, which means a
 * maintainer's local build produces exactly the three files the release workflow
 * uploads: the two installers and this list of their hashes.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

const ROOT = resolve(import.meta.dirname, '..')
const RELEASE = join(ROOT, 'release')

const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

/**
 * Both installers, always. A missing one means a target failed quietly, and a
 * checksums file listing only whatever happened to be on disk would ship that
 * failure instead of reporting it.
 */
const installers = [`GitDeck-Setup-${version}-x64.exe`, `GitDeck-Setup-${version}-x64.msi`]

const missing = installers.filter((name) => !existsSync(join(RELEASE, name)))
if (missing.length > 0) {
  throw new Error(`release/ is missing ${missing.join(' and ')} — run \`npm run package\` first`)
}

const sha256 = async (path) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

const lines = []
for (const name of installers) {
  lines.push(`${await sha256(join(RELEASE, name))}  ${name}`)
}

const output = join(RELEASE, `GitDeck-${version}-checksums.txt`)
await writeFile(output, `${lines.join('\n')}\n`, 'utf8')

console.log(`checksums: wrote ${output}`)
for (const line of lines) console.log(`  ${line}`)
