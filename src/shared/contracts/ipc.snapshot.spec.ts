import { describe, expect, it } from 'vitest'
import { IPC } from './ipc'

/**
 * The one snapshot in this codebase (TESTING.md §9).
 *
 * It exists to catch *unintended additions*: Phase 10 is presentation only and
 * must add no channel, and every phase after it should have to change this file
 * deliberately. Written inline rather than as a `.snap` file so the reviewed
 * diff is the surface itself, not a generated artefact.
 */
describe('the IPC surface', () => {
  it('is exactly this', () => {
    expect(IPC).toEqual({
      terminal: {
        create: 'terminal:create',
        write: 'terminal:write',
        resize: 'terminal:resize',
        kill: 'terminal:kill',
        profiles: 'terminal:profiles',
        data: 'terminal:data',
        exit: 'terminal:exit',
        // Phase 18 — deliberate addition. Explorer's "Open in GitDeck": the
        // pull for the launch argument and the push from a second instance.
        pendingOpenPath: 'terminal:pendingpath',
        openPath: 'terminal:openpath'
      },
      settings: {
        get: 'settings:get',
        update: 'settings:update'
      },
      workspace: {
        list: 'workspace:list',
        get: 'workspace:get',
        save: 'workspace:save',
        delete: 'workspace:delete'
      },
      git: {
        inspect: 'git:inspect'
      },
      // Phase 12 — deliberate addition. `ports:terminate` is the only
      // destructive channel in the application.
      ports: {
        list: 'ports:list',
        terminate: 'ports:terminate',
        open: 'ports:open'
      },
      // Phase 16 — deliberate addition. Read-only check plus opening the
      // release page Main minted; no channel accepts a URL or downloads
      // anything.
      updates: {
        check: 'updates:check',
        release: 'updates:release',
        available: 'updates:available'
      },
      // Phase 17 — deliberate addition. The data-folder picker is native and
      // Main-owned; no channel accepts a filesystem path.
      storage: {
        info: 'storage:info',
        choose: 'storage:choose'
      }
    })
  })

  it('holds seven namespaces and twenty-four channels', () => {
    // A count is a second, blunter guard: renaming a channel keeps the count,
    // but adding one cannot.
    const namespaces = Object.keys(IPC)
    const channels = Object.values(IPC).flatMap((namespace) => Object.values(namespace))

    expect(namespaces).toEqual([
      'terminal',
      'settings',
      'workspace',
      'git',
      'ports',
      'updates',
      'storage'
    ])
    expect(channels).toHaveLength(24)
  })
})
