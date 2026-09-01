import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { FakePtyFactory } from '../testing/FakePtyFactory'
import { TerminalManager } from './TerminalManager'
import { DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_TITLE, TerminalService } from './TerminalService'

const DEFAULT_CWD = 'C:/Users/test'
const DEFAULT_SHELL_PROFILE_ID = 'powershell' as const
const SERVICE_OPTIONS = {
  defaultCwd: DEFAULT_CWD,
  defaultShellProfileId: () => DEFAULT_SHELL_PROFILE_ID,
  availableShellProfiles: () => [{ id: DEFAULT_SHELL_PROFILE_ID, label: 'Windows PowerShell' }],
  directoryExists: () => true
}

let factory: FakePtyFactory
let service: TerminalService

beforeEach(() => {
  factory = new FakePtyFactory()
  service = new TerminalService(new TerminalManager(factory, createFakeLogger()), SERVICE_OPTIONS)
})

describe('TerminalService.create', () => {
  it('falls back to the configured cwd when the request omits one', () => {
    const session = service.create({})

    expect(session.definition.cwd).toBe(DEFAULT_CWD)
    expect(factory.last.options.cwd).toBe(DEFAULT_CWD)
  })

  it('fills in every default when the request carries only a cwd', () => {
    const session = service.create({ cwd: 'D:\\work' })

    expect(session.definition.title).toBe(DEFAULT_TITLE)
    expect(session.definition.shellProfileId).toBe(DEFAULT_SHELL_PROFILE_ID)
    expect(session.definition.cwd).toBe('D:\\work')
    expect(factory.last.options.cols).toBe(DEFAULT_COLS)
    expect(factory.last.options.rows).toBe(DEFAULT_ROWS)
  })

  it('prefers the values the request supplies', () => {
    service.create({
      cwd: 'C:\\repo',
      title: 'Backend',
      shellProfileId: 'git-bash',
      cols: 132,
      rows: 43
    })

    expect(factory.last.options).toEqual({
      shellProfileId: 'git-bash',
      cwd: 'C:\\repo',
      cols: 132,
      rows: 43
    })
  })

  it('mints a definition id per terminal', () => {
    const a = service.create({ cwd: 'C:\\a' })
    const b = service.create({ cwd: 'C:\\b' })

    expect(a.definition.id).toMatch(/^term_/)
    expect(a.definition.id).not.toBe(b.definition.id)
    expect(a.id).not.toBe(a.definition.id)
  })

  it('omits startupCommand entirely when none is given', () => {
    const session = service.create({ cwd: 'C:\\a' })

    expect('startupCommand' in session.definition).toBe(false)
  })

  it('falls back to the default cwd when the requested directory is gone', () => {
    // A workspace outlives the directories it points at.
    const missing = new TerminalService(new TerminalManager(factory, createFakeLogger()), {
      ...SERVICE_OPTIONS,
      directoryExists: (path) => path !== 'D:\\deleted'
    })

    const session = missing.create({ cwd: 'D:\\deleted' })

    expect(session.definition.cwd).toBe(DEFAULT_CWD)
    expect(session.status).toBe('running')
  })

  it('spawns in the fallback directory, not just reports one', () => {
    const missing = new TerminalService(new TerminalManager(factory, createFakeLogger()), {
      ...SERVICE_OPTIONS,
      directoryExists: () => false
    })

    missing.create({ cwd: 'D:\\deleted' })

    expect(factory.last.options.cwd).toBe(DEFAULT_CWD)
  })

  it('leaves a directory that exists alone', () => {
    const session = service.create({ cwd: 'C:\\a' })

    expect(session.definition.cwd).toBe('C:\\a')
  })

  it('keeps startupCommand on the definition but does not run it', () => {
    const session = service.create({ cwd: 'C:\\a', startupCommand: 'npm run dev' })

    expect(session.definition.startupCommand).toBe('npm run dev')
    // Running it is the renderer's decision, gated by settings in Phase 8.
    expect(factory.last.writes).toEqual([])
  })
})
