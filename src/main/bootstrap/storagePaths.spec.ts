import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStoragePaths } from './storagePaths'

describe('storage paths', () => {
  const paths = createStoragePaths(`C:${sep}data`, `C:${sep}logs`)

  it('mints every persisted path from the two roots', () => {
    expect(paths.userDataDir).toBe(`C:${sep}data`)
    expect(paths.settingsFile).toBe(`C:${sep}data${sep}settings.json`)
    expect(paths.workspacesDir).toBe(`C:${sep}data${sep}workspaces`)
    expect(paths.manifestFile).toBe(`C:${sep}data${sep}storage.json`)
    expect(paths.backupsDir).toBe(`C:${sep}data${sep}backups`)
    expect(paths.workspaceBackupsDir).toBe(`C:${sep}data${sep}backups${sep}workspaces`)
    expect(paths.logFile).toBe(`C:${sep}logs${sep}gitdeck.log`)
  })

  it('keeps user data and logs under their own roots, never crossed', () => {
    const underData = [
      paths.settingsFile,
      paths.workspacesDir,
      paths.manifestFile,
      paths.backupsDir,
      paths.workspaceBackupsDir
    ]
    for (const path of underData) {
      expect(path.startsWith(`C:${sep}data${sep}`)).toBe(true)
    }
    expect(paths.logFile.startsWith(`C:${sep}logs${sep}`)).toBe(true)
  })
})
