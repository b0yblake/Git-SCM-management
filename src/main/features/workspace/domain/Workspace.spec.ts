import { describe, expect, it } from 'vitest'
import { InvalidWorkspaceError } from './errors'
import { parseWorkspace, parseWorkspaceInput, toSummary } from './Workspace'

const WS_ID = 'ws_11111111-2222-4333-8444-555555555555'

const definition = (
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id,
  title: 'Terminal',
  cwd: 'C:\\Users\\dev',
  shellProfileId: 'powershell',
  ...overrides
})

const stored = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: WS_ID,
  name: 'GitDeck',
  version: 1,
  terminals: [definition('term_a')],
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides
})

describe('parseWorkspace — a record that can be trusted', () => {
  it('accepts a complete record and returns every field', () => {
    expect(parseWorkspace(stored())).toEqual({
      id: WS_ID,
      name: 'GitDeck',
      version: 1,
      terminals: [
        { id: 'term_a', title: 'Terminal', cwd: 'C:\\Users\\dev', shellProfileId: 'powershell' }
      ],
      createdAt: 1000,
      updatedAt: 2000
    })
  })

  it('accepts a workspace with zero terminals', () => {
    expect(parseWorkspace(stored({ terminals: [] })).terminals).toEqual([])
  })

  it('keeps a startupCommand and omits the key when there is none', () => {
    const withCommand = stored({
      terminals: [definition('term_a', { startupCommand: 'npm run dev' })]
    })

    expect(parseWorkspace(withCommand).terminals[0]?.startupCommand).toBe('npm run dev')
    expect('startupCommand' in parseWorkspace(stored()).terminals[0]!).toBe(false)
  })

  it('survives unicode and Windows paths with spaces and backslashes', () => {
    const awkward = stored({
      name: 'Dự án — GitDeck 🚀',
      terminals: [definition('term_a', { cwd: 'C:\\Users\\lích\\My Projects\\dự án' })]
    })

    expect(parseWorkspace(awkward).name).toBe('Dự án — GitDeck 🚀')
    expect(parseWorkspace(awkward).terminals[0]?.cwd).toBe('C:\\Users\\lích\\My Projects\\dự án')
  })
})

describe('parseWorkspace — a record that cannot', () => {
  const rejects = (raw: unknown): void => {
    expect(() => parseWorkspace(raw)).toThrow(InvalidWorkspaceError)
  }

  it('rejects anything that is not an object', () => {
    rejects(null)
    rejects('a workspace')
    rejects([stored()])
  })

  it('rejects a missing or malformed name', () => {
    rejects(stored({ name: undefined }))
    rejects(stored({ name: '' }))
    rejects(stored({ name: 42 }))
  })

  it('rejects terminals that are not an array', () => {
    rejects(stored({ terminals: undefined }))
    rejects(stored({ terminals: { 0: definition('term_a') } }))
  })

  it('rejects a terminal missing a required field', () => {
    rejects(stored({ terminals: [definition('term_a', { cwd: undefined })] }))
    rejects(stored({ terminals: [definition('term_a', { title: undefined })] }))
    rejects(stored({ terminals: [definition('', {})] }))
  })

  it('rejects an unknown shell profile rather than passing it through', () => {
    rejects(stored({ terminals: [definition('term_a', { shellProfileId: 'fish' })] }))
  })

  it('rejects an id that is not a workspace id', () => {
    rejects(stored({ id: undefined }))
    rejects(stored({ id: 'not-an-id' }))
    // A well-formed id from a different feature is still not a workspace id.
    rejects(stored({ id: 'term_11111111-2222-4333-8444-555555555555' }))
  })

  it('rejects a missing or non-numeric timestamp', () => {
    rejects(stored({ createdAt: undefined }))
    rejects(stored({ updatedAt: '2000' }))
    rejects(stored({ createdAt: Number.NaN }))
  })

  it('never silently accepts a version it does not understand', () => {
    rejects(stored({ version: 2 }))
    rejects(stored({ version: '1' }))
    rejects(stored({ version: undefined }))
  })

  it('names the version in the message, so a hand-edited file can be fixed', () => {
    expect(() => parseWorkspace(stored({ version: 7 }))).toThrow(/version 7/)
  })
})

/** The rule this phase exists to enforce: definitions in, runtime state out. */
describe('runtime state cannot get in', () => {
  it('drops session fields attached to a terminal definition', () => {
    const polluted = parseWorkspace(
      stored({
        terminals: [
          definition('term_a', { sessionId: 'sess_1', status: 'running', exitCode: 0, pty: {} })
        ]
      })
    )

    expect(polluted.terminals[0]).toEqual({
      id: 'term_a',
      title: 'Terminal',
      cwd: 'C:\\Users\\dev',
      shellProfileId: 'powershell'
    })
  })

  it('drops unknown top-level fields', () => {
    const parsed = parseWorkspace(stored({ activeSessionId: 'sess_1', layout: 'split' }))

    expect(Object.keys(parsed).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'terminals',
      'updatedAt',
      'version'
    ])
  })
})

describe('activeTerminalId', () => {
  it('is kept when it names one of the terminals', () => {
    const parsed = parseWorkspace(stored({ activeTerminalId: 'term_a' }))

    expect(parsed.activeTerminalId).toBe('term_a')
  })

  it('is dropped when the terminal it named has been removed', () => {
    const parsed = parseWorkspace(stored({ activeTerminalId: 'term_deleted' }))

    expect('activeTerminalId' in parsed).toBe(false)
  })

  it('is dropped when there are no terminals at all', () => {
    const parsed = parseWorkspace(stored({ terminals: [], activeTerminalId: 'term_a' }))

    expect('activeTerminalId' in parsed).toBe(false)
  })
})

describe('parseWorkspaceInput', () => {
  it('accepts an input with no id — that is what "create" looks like', () => {
    const input = parseWorkspaceInput({ name: 'New', terminals: [] })

    expect(input).toEqual({ name: 'New', terminals: [] })
  })

  it('ignores version and timestamps supplied by a caller', () => {
    const input = parseWorkspaceInput({
      name: 'New',
      terminals: [],
      version: 99,
      createdAt: 1,
      updatedAt: 2
    })

    expect(Object.keys(input).sort()).toEqual(['name', 'terminals'])
  })

  it('still rejects a malformed terminal', () => {
    expect(() => parseWorkspaceInput({ name: 'New', terminals: [{ id: 'term_a' }] })).toThrow(
      InvalidWorkspaceError
    )
  })
})

describe('toSummary', () => {
  it('reports a count instead of the definitions themselves', () => {
    const workspace = parseWorkspace(
      stored({ terminals: [definition('term_a'), definition('term_b')] })
    )

    expect(toSummary(workspace)).toEqual({
      id: WS_ID,
      name: 'GitDeck',
      terminalCount: 2,
      createdAt: 1000,
      updatedAt: 2000
    })
  })
})
