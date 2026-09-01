import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, MAX_FONT_SIZE, MIN_FONT_SIZE } from '@shared/contracts/settings'
import { normalizeSettings } from '../domain/AppSettings'
import { createInMemorySettingsStore } from '../testing/InMemorySettingsStore'
import { SettingsService } from './SettingsService'

describe('SettingsService', () => {
  it('starts from whatever the store holds', () => {
    const store = createInMemorySettingsStore({ ...DEFAULT_SETTINGS, defaultShellProfileId: 'cmd' })

    expect(new SettingsService(store).get().defaultShellProfileId).toBe('cmd')
  })

  it('a partial patch leaves unrelated fields untouched', () => {
    const service = new SettingsService(createInMemorySettingsStore())
    service.update({ defaultShellProfileId: 'cmd', restoreLastWorkspace: false })

    service.update({ activeTerminalDefinitionId: 'term_1' })

    expect(service.get()).toEqual({
      ...DEFAULT_SETTINGS,
      defaultShellProfileId: 'cmd',
      restoreLastWorkspace: false,
      activeTerminalDefinitionId: 'term_1'
    })
  })

  it('persists an update', () => {
    const store = createInMemorySettingsStore()
    const service = new SettingsService(store)

    service.update({ defaultShellProfileId: 'git-bash' })

    expect(store.writes).toHaveLength(1)
    expect(store.current().defaultShellProfileId).toBe('git-bash')
  })

  /** The acceptance criterion: the chosen default survives a restart. */
  it('a new service reads back what the previous one wrote', () => {
    const store = createInMemorySettingsStore()
    new SettingsService(store).update({ defaultShellProfileId: 'pwsh' })

    expect(new SettingsService(store).get().defaultShellProfileId).toBe('pwsh')
  })

  it('leaves unrelated fields untouched', () => {
    const store = createInMemorySettingsStore()
    const service = new SettingsService(store)

    service.update({})

    expect(service.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('can clear the preference back to null', () => {
    const store = createInMemorySettingsStore({ ...DEFAULT_SETTINGS, defaultShellProfileId: 'cmd' })
    const service = new SettingsService(store)

    service.update({ defaultShellProfileId: null })

    expect(service.get().defaultShellProfileId).toBeNull()
  })
})

describe('normalizeSettings', () => {
  it.each([null, undefined, 42, 'text', [], { nope: true }])(
    'falls back to defaults for %s',
    (raw) => {
      expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  )

  it('drops a shell profile it does not recognise', () => {
    expect(normalizeSettings({ defaultShellProfileId: 'fish' }).defaultShellProfileId).toBeNull()
  })

  it('keeps a recognised shell profile', () => {
    expect(normalizeSettings({ defaultShellProfileId: 'wsl' }).defaultShellProfileId).toBe('wsl')
  })

  it('keeps a well-formed active workspace id', () => {
    const id = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

    expect(normalizeSettings({ activeWorkspaceId: id }).activeWorkspaceId).toBe(id)
  })

  it('drops an active workspace id that is not a workspace id', () => {
    // Left over from a hand-edit, or a stale id from another feature. Phase 8
    // restores from this field, so a value it cannot use must not survive.
    expect(normalizeSettings({ activeWorkspaceId: 'the-last-one' }).activeWorkspaceId).toBeNull()
    expect(
      normalizeSettings({ activeWorkspaceId: 'term_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
        .activeWorkspaceId
    ).toBeNull()
  })

  it('defaults restore on and startup commands off', () => {
    // The asymmetry is the point: reopening a workspace is harmless, re-running
    // its commands is not.
    expect(normalizeSettings({}).restoreLastWorkspace).toBe(true)
    expect(normalizeSettings({}).runStartupCommandsOnRestore).toBe(false)
  })

  it('keeps the booleans a user actually set', () => {
    const raw = { restoreLastWorkspace: false, runStartupCommandsOnRestore: true }

    expect(normalizeSettings(raw).restoreLastWorkspace).toBe(false)
    expect(normalizeSettings(raw).runStartupCommandsOnRestore).toBe(true)
  })

  it('replaces a boolean of the wrong type rather than trusting it', () => {
    // A hand-edited "true" must not switch on command execution.
    expect(
      normalizeSettings({ runStartupCommandsOnRestore: 'true' }).runStartupCommandsOnRestore
    ).toBe(false)
    expect(normalizeSettings({ restoreLastWorkspace: 0 }).restoreLastWorkspace).toBe(true)
  })

  it('keeps the last active terminal definition, and drops an empty one', () => {
    expect(
      normalizeSettings({ activeTerminalDefinitionId: 'term_1' }).activeTerminalDefinitionId
    ).toBe('term_1')
    expect(
      normalizeSettings({ activeTerminalDefinitionId: '' }).activeTerminalDefinitionId
    ).toBeNull()
    expect(
      normalizeSettings({ activeTerminalDefinitionId: 42 }).activeTerminalDefinitionId
    ).toBeNull()
  })

  it('clamps an unusable font size back to the default', () => {
    // A hand-edited 0 or 900 would leave the terminal unreadable or blank.
    expect(normalizeSettings({ terminalFontSize: 0 }).terminalFontSize).toBe(14)
    expect(normalizeSettings({ terminalFontSize: 900 }).terminalFontSize).toBe(14)
    expect(normalizeSettings({ terminalFontSize: 12.5 }).terminalFontSize).toBe(14)
    expect(normalizeSettings({ terminalFontSize: '16' }).terminalFontSize).toBe(14)
  })

  it('keeps a font size a user could plausibly have chosen', () => {
    expect(normalizeSettings({ terminalFontSize: 18 }).terminalFontSize).toBe(18)
    expect(normalizeSettings({ terminalFontSize: MIN_FONT_SIZE }).terminalFontSize).toBe(
      MIN_FONT_SIZE
    )
    expect(normalizeSettings({ terminalFontSize: MAX_FONT_SIZE }).terminalFontSize).toBe(
      MAX_FONT_SIZE
    )
  })

  it('defaults the close confirmation on, because closing kills a shell', () => {
    expect(normalizeSettings({}).confirmBeforeClosingRunningTerminal).toBe(true)
    expect(
      normalizeSettings({ confirmBeforeClosingRunningTerminal: false })
        .confirmBeforeClosingRunningTerminal
    ).toBe(false)
  })

  /** `version` is owned by Main; a hand-edited file cannot change it. */
  it('always stamps the current version', () => {
    expect(normalizeSettings({ version: 99, defaultShellProfileId: 'cmd' }).version).toBe(1)
  })

  it('produces settings that survive structuredClone', () => {
    expect(() => structuredClone(normalizeSettings({ defaultShellProfileId: 'cmd' }))).not.toThrow()
  })
})
