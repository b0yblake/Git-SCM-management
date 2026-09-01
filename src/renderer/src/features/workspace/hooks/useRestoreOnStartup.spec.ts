import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppSettingsPatch } from '@shared/contracts/settings'
import type { TerminalDefinition } from '@shared/contracts/terminal'
import type { Workspace } from '@shared/contracts/workspace'
import {
  createFakeGitDeckApi,
  FAKE_FALLBACK_CWD,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../../terminal/public'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useRestoreOnStartup } from './useRestoreOnStartup'

const WS_ID = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const definition = (
  id: string,
  overrides: Partial<TerminalDefinition> = {}
): TerminalDefinition => ({
  id,
  title: id,
  cwd: 'D:\\Projects\\my-saas',
  shellProfileId: 'git-bash',
  ...overrides
})

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: WS_ID,
  name: 'My SaaS',
  version: 1,
  terminals: [
    definition('term_1', { title: 'Backend', startupCommand: 'npm run dev' }),
    definition('term_2', { title: 'Frontend', startupCommand: 'npm start' })
  ],
  createdAt: 1,
  updatedAt: 2,
  ...overrides
})

let api: FakeGitDeckApi

/** Puts the app in the state a previous run would have left behind. */
const givenLastRun = async (patch: AppSettingsPatch): Promise<void> => {
  await api.settings.update({ activeWorkspaceId: WS_ID, ...patch })
}

const startUp = async () => {
  const view = renderHook(() => useRestoreOnStartup())
  await waitFor(() => expect(view.result.current.status).toBe('settled'))
  return view
}

const titles = (): (string | undefined)[] => {
  const { sessions, order } = useTerminalStore.getState()
  return order.map((id) => sessions[id]?.definition.title)
}

const startupCommandWrites = (): string[] =>
  api.calls.write.filter(({ data }) => /npm/.test(data)).map(({ data }) => data)

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useTerminalStore.getState().reset()
  useWorkspaceStore.getState().reset()
})

afterEach(() => {
  api.uninstall()
})

describe('restore is off', () => {
  it('loads no workspace at all', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({ restoreLastWorkspace: false })

    const { result } = await startUp()

    expect(api.calls.workspaceGet).toEqual([])
    expect(result.current.restoredWorkspace).toBe(false)
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull()
  })

  /**
   * Deliberate reading of "the app starts empty": no workspace is restored. A
   * fresh interactive shell restores nothing, and a blank window would be a
   * regression against every earlier phase.
   */
  it('still opens a single plain shell, so the window is never blank', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({ restoreLastWorkspace: false })

    await startUp()

    expect(api.calls.create).toEqual([{}])
    expect(useTerminalStore.getState().order).toHaveLength(1)
  })
})

describe('restore is on', () => {
  it('spawns one session per definition', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})

    const { result } = await startUp()

    expect(result.current.restoredWorkspace).toBe(true)
    expect(titles()).toEqual(['Backend', 'Frontend'])
  })

  it('does not add a plain shell on top of the restored ones', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})

    await startUp()

    expect(api.calls.create).toHaveLength(2)
  })

  it('every definition keeps its title, cwd and shell profile', async () => {
    api.seedWorkspaces(
      workspace({
        terminals: [
          definition('term_1', { title: 'Backend', cwd: 'D:\\a', shellProfileId: 'cmd' }),
          definition('term_2', { title: 'Frontend', cwd: 'D:\\b', shellProfileId: 'powershell' })
        ]
      })
    )
    await givenLastRun({})

    await startUp()

    expect(api.calls.create).toEqual([
      { title: 'Backend', cwd: 'D:\\a', shellProfileId: 'cmd' },
      { title: 'Frontend', cwd: 'D:\\b', shellProfileId: 'powershell' }
    ])
  })

  it('puts the user back on the tab they were looking at', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({ activeTerminalDefinitionId: 'term_2' })

    await startUp()

    const { bindings } = useWorkspaceStore.getState()
    expect(useTerminalStore.getState().activeSessionId).toBe(bindings['term_2'])
  })

  it('falls back to the workspace’s own active terminal when there is no memory of one', async () => {
    api.seedWorkspaces(workspace({ activeTerminalId: 'term_2' }))
    await givenLastRun({})

    await startUp()

    const { bindings } = useWorkspaceStore.getState()
    expect(useTerminalStore.getState().activeSessionId).toBe(bindings['term_2'])
  })

  it('starts plain when nothing was open last time', async () => {
    api.seedWorkspaces(workspace())

    const { result } = await startUp()

    expect(result.current.restoredWorkspace).toBe(false)
    expect(api.calls.workspaceGet).toEqual([])
    expect(api.calls.create).toEqual([{}])
  })
})

/** The guard this phase exists for. */
describe('startup commands', () => {
  it('runs none of them when the user has not opted in', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})

    await startUp()

    expect(startupCommandWrites()).toEqual([])
    expect(api.calls.write).toEqual([])
  })

  it('does not even send them to Main, so nothing downstream can run them', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})

    await startUp()

    // The definitions do carry commands — this is not vacuously true.
    expect(api.storedWorkspaces()[0]?.terminals[0]?.startupCommand).toBe('npm run dev')
    expect(startupCommandWrites()).toEqual([])
  })

  it('a session restored without the opt-in is still a normal interactive shell', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})

    await startUp()

    const { sessions, order } = useTerminalStore.getState()
    expect(order.map((id) => sessions[id]?.status)).toEqual(['running', 'running'])
  })

  it('runs each command exactly once, on its own session, when opted in', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({ runStartupCommandsOnRestore: true })

    await startUp()

    const { bindings } = useWorkspaceStore.getState()
    expect(api.calls.write).toEqual([
      { sessionId: bindings['term_1'], data: 'npm run dev\r' },
      { sessionId: bindings['term_2'], data: 'npm start\r' }
    ])
  })

  it('sends nothing for a definition that has no startup command', async () => {
    api.seedWorkspaces(workspace({ terminals: [definition('term_1', { title: 'Plain' })] }))
    await givenLastRun({ runStartupCommandsOnRestore: true })

    await startUp()

    expect(api.calls.write).toEqual([])
  })
})

/** One bad definition must never prevent the rest of the workspace opening. */
describe('degrading well', () => {
  it('opens a terminal elsewhere when its saved directory is gone, and says so', async () => {
    api.seedWorkspaces(
      workspace({
        terminals: [
          definition('term_1', { title: 'Backend', cwd: 'D:\\deleted' }),
          definition('term_2', { title: 'Frontend', cwd: 'D:\\kept' })
        ]
      })
    )
    api.markDirectoryMissing('D:\\deleted')
    await givenLastRun({})

    await startUp()

    expect(titles()).toEqual(['Backend', 'Frontend'])
    expect(useWorkspaceStore.getState().openNotices).toEqual([
      {
        definitionId: 'term_1',
        title: 'Backend',
        severity: 'warning',
        message: `D:\\deleted no longer exists — opened in ${FAKE_FALLBACK_CWD}`
      }
    ])
  })

  it('a missing directory is a warning, not a failure — the tab is live', async () => {
    api.seedWorkspaces(
      workspace({ terminals: [definition('term_1', { title: 'Backend', cwd: 'D:\\deleted' })] })
    )
    api.markDirectoryMissing('D:\\deleted')
    await givenLastRun({})

    await startUp()

    const { sessions, order } = useTerminalStore.getState()
    expect(sessions[order[0]!]?.definition.cwd).toBe(FAKE_FALLBACK_CWD)
    expect(useWorkspaceStore.getState().bindings['term_1']).toBe(order[0])
  })

  it('reports a shell that is not installed against that tab only', async () => {
    api.seedWorkspaces(workspace())
    api.failCreateFor('Backend')
    await givenLastRun({})

    await startUp()

    expect(titles()).toEqual(['Frontend'])
    expect(useWorkspaceStore.getState().openNotices).toEqual([
      {
        definitionId: 'term_1',
        title: 'Backend',
        severity: 'error',
        message: 'No shell for Backend'
      }
    ])
  })

  it('two of three definitions failing still opens the third', async () => {
    api.seedWorkspaces(
      workspace({
        terminals: [
          definition('term_1', { title: 'A' }),
          definition('term_2', { title: 'B' }),
          definition('term_3', { title: 'C' })
        ]
      })
    )
    api.failCreateFor('A')
    api.failCreateFor('B')
    await givenLastRun({})

    await startUp()

    expect(titles()).toEqual(['C'])
    expect(useWorkspaceStore.getState().openNotices).toHaveLength(2)
  })

  it('starts plain when every definition fails, rather than leaving a blank window', async () => {
    api.seedWorkspaces(workspace({ terminals: [definition('term_1', { title: 'Backend' })] }))
    api.failCreateFor('Backend')
    await givenLastRun({})

    const { result } = await startUp()

    expect(result.current.restoredWorkspace).toBe(false)
    expect(useTerminalStore.getState().order).toHaveLength(1)
  })

  it('a deleted workspace file starts the app plainly, with no repeating error', async () => {
    // Nothing seeded: the id in settings points at a file that is gone.
    await givenLastRun({})

    const { result } = await startUp()

    expect(result.current.restoredWorkspace).toBe(false)
    expect(api.calls.create).toEqual([{}])
    // "No dialog loop" in practice means one attempt, then settle.
    expect(api.calls.workspaceGet).toEqual([WS_ID])
  })

  it('a settings channel failure starts the app plainly', async () => {
    api.settings.get = () =>
      Promise.resolve({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'unreadable' } })

    const { result } = await startUp()

    expect(result.current.restoredWorkspace).toBe(false)
    expect(api.calls.create).toEqual([{}])
  })
})

describe('it runs once', () => {
  it('a re-render does not restore a second time', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})
    const { rerender } = await startUp()

    rerender()
    rerender()
    await waitFor(() => expect(api.calls.create).toHaveLength(2))

    expect(api.calls.workspaceGet).toEqual([WS_ID])
  })
})

/** The line this phase exists to keep drawn. */
describe('scope', () => {
  it('rebuilds from definitions and never asks for prior process state', async () => {
    api.seedWorkspaces(workspace())
    await givenLastRun({})

    await startUp()

    // Every create is built from a definition and nothing else: no session id,
    // no exit code, no trace of the run that came before. The command travels
    // as part of the definition but is never executed — see the suite above.
    for (const request of api.calls.create) {
      expect(Object.keys(request as object).sort()).toEqual([
        'cwd',
        'shellProfileId',
        'startupCommand',
        'title'
      ])
    }
    expect(JSON.stringify(api.calls.create)).not.toContain('sess_')
  })
})
