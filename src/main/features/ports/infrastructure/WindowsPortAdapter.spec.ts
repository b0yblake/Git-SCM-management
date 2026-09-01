import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PortAccessDeniedError,
  PortInspectionError,
  PortInspectionTimeoutError,
  PortTerminationError
} from '../domain/errors'
import {
  createWindowsPortAdapter,
  INSPECT_ARGS,
  INSPECT_SCRIPT,
  INSPECT_TIMEOUT_MS,
  KILL_TIMEOUT_MS,
  MAX_INSPECTION_OUTPUT_BYTES,
  parseInspectionJson,
  type PortCommandLimits,
  type PortCommandOutcome
} from './WindowsPortAdapter'

/** Records every run and answers with a scripted outcome — no OS involved. */
const runner = (...outcomes: PortCommandOutcome[]) => {
  const calls: Array<{ file: string; args: readonly string[]; limits: PortCommandLimits }> = []
  const run = (file: string, args: readonly string[], limits: PortCommandLimits) => {
    calls.push({ file, args, limits })
    return Promise.resolve(outcomes.shift() ?? ({ kind: 'ok', stdout: '{}' } as const))
  }
  return { calls, run }
}

const ok = (stdout: string): PortCommandOutcome => ({ kind: 'ok', stdout })
const exit = (code: number, stderr = '', stdout = ''): PortCommandOutcome => ({
  kind: 'exit',
  code,
  stdout,
  stderr
})

describe('inspection command construction', () => {
  it('runs Windows PowerShell with the fixed script, non-interactive and bounded', async () => {
    const { calls, run } = runner(ok('{"tcp":[],"udp":[],"processes":[]}'))

    await createWindowsPortAdapter({ run }).inspect()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.file.toLowerCase().endsWith('powershell.exe')).toBe(true)
    expect(calls[0]?.args).toEqual(INSPECT_ARGS)
    expect(calls[0]?.limits).toEqual({
      timeoutMs: INSPECT_TIMEOUT_MS,
      maxOutputBytes: MAX_INSPECTION_OUTPUT_BYTES
    })
  })

  it('asks only for listening TCP — established connections are excluded at the source', () => {
    expect(INSPECT_SCRIPT).toContain('Get-NetTCPConnection -State Listen')
    expect(INSPECT_SCRIPT).toContain('Get-NetUDPEndpoint')
    expect(INSPECT_SCRIPT).toContain('Get-Process')
  })

  it('interpolates nothing: the script is one constant, whoever asks', async () => {
    const first = runner(ok('{}'))
    const second = runner(ok('{}'))

    await createWindowsPortAdapter({ run: first.run }).inspect()
    await createWindowsPortAdapter({ run: second.run }).inspect()

    expect(first.calls[0]?.args).toEqual(second.calls[0]?.args)
  })
})

describe('inspection output parsing', () => {
  it('reads TCP and UDP rows into protocol-stamped bindings', () => {
    const inspection = parseInspectionJson(
      JSON.stringify({
        tcp: [{ LocalAddress: '127.0.0.1', LocalPort: 3000, OwningProcess: 18420 }],
        udp: [{ LocalAddress: '0.0.0.0', LocalPort: 5353, OwningProcess: 77 }],
        processes: [{ Id: 18420, ProcessName: 'node', SessionId: 1, StartTime: 1000 }]
      })
    )

    expect(inspection.bindings).toEqual([
      { protocol: 'tcp', localAddress: '127.0.0.1', localPort: 3000, pid: 18420 },
      { protocol: 'udp', localAddress: '0.0.0.0', localPort: 5353, pid: 77 }
    ])
    expect(inspection.processes).toEqual([
      { pid: 18420, name: 'node', startedAt: 1000, sessionId: 1 }
    ])
  })

  it('accepts the PowerShell 5.1 single-element unwrap: a lone object is a one-row list', () => {
    const inspection = parseInspectionJson(
      JSON.stringify({
        tcp: { LocalAddress: '::', LocalPort: 8080, OwningProcess: 5 },
        udp: null,
        processes: { Id: 5, ProcessName: 'java', SessionId: 1, StartTime: 7 }
      })
    )

    expect(inspection.bindings).toHaveLength(1)
    expect(inspection.processes).toHaveLength(1)
  })

  it('treats empty output collections as a valid empty snapshot', () => {
    expect(parseInspectionJson('{"tcp":[],"udp":[],"processes":[]}')).toEqual({
      bindings: [],
      processes: []
    })
  })

  it('keeps a process with unreadable metadata, as nulls', () => {
    const inspection = parseInspectionJson(
      JSON.stringify({
        tcp: [],
        udp: [],
        processes: [{ Id: 4, ProcessName: 'System', SessionId: 0, StartTime: null }]
      })
    )

    expect(inspection.processes[0]).toEqual({
      pid: 4,
      name: 'System',
      startedAt: null,
      sessionId: 0
    })
  })

  it.each([
    ['not JSON at all', 'ERROR: something'],
    ['a JSON scalar', '42'],
    ['a binding without an address', '{"tcp":[{"LocalPort":80,"OwningProcess":1}],"udp":[]}'],
    ['an impossible port', '{"tcp":[{"LocalAddress":"::","LocalPort":70000,"OwningProcess":1}]}'],
    ['a stringly port', '{"tcp":[{"LocalAddress":"::","LocalPort":"80","OwningProcess":1}]}'],
    ['a negative owner', '{"tcp":[{"LocalAddress":"::","LocalPort":80,"OwningProcess":-1}]}'],
    ['a process without an Id', '{"tcp":[],"udp":[],"processes":[{"ProcessName":"x"}]}']
  ])('rejects malformed output — %s', (_name, stdout) => {
    expect(() => parseInspectionJson(stdout)).toThrow(PortInspectionError)
  })
})

describe('inspection failure modes', () => {
  it('a timed-out inspector becomes a handled timeout error', async () => {
    const { run } = runner({ kind: 'timeout' })

    await expect(createWindowsPortAdapter({ run }).inspect()).rejects.toBeInstanceOf(
      PortInspectionTimeoutError
    )
  })

  it('oversized output is rejected, not truncated into a wrong answer', async () => {
    const { run } = runner({ kind: 'oversized' })

    await expect(createWindowsPortAdapter({ run }).inspect()).rejects.toBeInstanceOf(
      PortInspectionError
    )
  })

  it('a failing script — e.g. the NetTCPIP cmdlets are missing — is a handled error', async () => {
    const { run } = runner(exit(1, "The term 'Get-NetTCPConnection' is not recognized"))

    await expect(createWindowsPortAdapter({ run }).inspect()).rejects.toBeInstanceOf(
      PortInspectionError
    )
  })
})

describe('termination command construction', () => {
  it('runs taskkill with exactly /PID, the decimal pid and /F', async () => {
    const { calls, run } = runner(ok(''))

    await createWindowsPortAdapter({ run }).terminate(18420)

    expect(calls[0]?.file.toLowerCase().endsWith('taskkill.exe')).toBe(true)
    expect(calls[0]?.args).toEqual(['/PID', '18420', '/F'])
    expect(calls[0]?.limits.timeoutMs).toBe(KILL_TIMEOUT_MS)
  })

  it.each([0, 4, -1, 1.5, Number.NaN])(
    'refuses to build a command for pid %p at all',
    async (pid) => {
      const { calls, run } = runner()

      await expect(createWindowsPortAdapter({ run }).terminate(pid)).rejects.toBeInstanceOf(
        PortTerminationError
      )
      expect(calls).toEqual([])
    }
  )

  it('exit 0 is terminated', async () => {
    const { run } = runner(ok('SUCCESS'))

    await expect(createWindowsPortAdapter({ run }).terminate(100)).resolves.toBe('terminated')
  })

  it('exit 128 — no such process — is already-exited, a harmless race', async () => {
    const { run } = runner(exit(128, 'ERROR: The process "100" not found.'))

    await expect(createWindowsPortAdapter({ run }).terminate(100)).resolves.toBe('already-exited')
  })

  it('access denied surfaces as the typed refusal, never as elevation', async () => {
    const { run } = runner(exit(1, 'ERROR: ... Reason: Access is denied.'))

    await expect(createWindowsPortAdapter({ run }).terminate(100)).rejects.toBeInstanceOf(
      PortAccessDeniedError
    )
  })

  it('any other exit is a plain termination failure', async () => {
    const { run } = runner(exit(1, 'ERROR: something else'))

    await expect(createWindowsPortAdapter({ run }).terminate(100)).rejects.toBeInstanceOf(
      PortTerminationError
    )
  })

  it('a hung taskkill is a failure, not a wait', async () => {
    const { run } = runner({ kind: 'timeout' })

    await expect(createWindowsPortAdapter({ run }).terminate(100)).rejects.toBeInstanceOf(
      PortTerminationError
    )
  })
})

/**
 * Source scan: the argument surface this feature is forbidden to grow.
 *
 * `/IM` kills by image name, `/T` kills a whole tree, a wildcard kills
 * everything, `runas`/elevation escalates, and `Stop-Process` would be a
 * second, unaudited kill path. None may appear in production ports code.
 */
describe('the production ports feature, scanned', () => {
  const FEATURE = resolve(import.meta.dirname, '..')

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'testing' ? [] : sourceFiles(path)
      return entry.name.endsWith('.ts') && !entry.name.includes('.spec.') ? [path] : []
    })

  const files = sourceFiles(FEATURE)
  const show = (path: string): string => relative(FEATURE, path).split(sep).join('/')

  // Quote chars are ' and " only: comments in the adapter legitimately *name*
  // these arguments in backticks while explaining why they are banned.
  const FORBIDDEN: ReadonlyArray<[name: string, pattern: RegExp, sample: string]> = [
    ['/IM argument', /['"]\/IM['"]/, `run('taskkill', ['/IM', 'node.exe'])`],
    ['/T argument', /['"]\/T['"]/, `run('taskkill', ['/PID', pid, '/T'])`],
    ['wildcard image', /['"]\*['"]/, `run('taskkill', ['/IM', '*'])`],
    ['remote host argument', /['"]\/S['"]/, `run('taskkill', ['/S', host])`],
    ['elevation', /runas|-Verb\s+RunAs/i, `shell.execute('runas')`],
    ['a second kill path', /Stop-Process|process\.kill\(/, `Stop-Process -Id 1`]
  ]

  it('scans the real production files', () => {
    // Guards the guard: a broken walk would make everything below vacuous.
    expect(files.map(show)).toContain('infrastructure/WindowsPortAdapter.ts')
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(FORBIDDEN)('each %s pattern actually classifies', (_name, pattern, sample) => {
    expect(pattern.test(sample)).toBe(true)
  })

  it.each(FORBIDDEN)('no production ports file constructs a %s', (_name, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map(show)

    expect(offenders).toEqual([])
  })

  it('keeps child_process inside this one adapter', () => {
    const offenders = files
      .filter((file) => /node:child_process/.test(readFileSync(file, 'utf8')))
      .map(show)

    expect(offenders).toEqual(['infrastructure/WindowsPortAdapter.ts'])
  })

  it('runs the real commands hidden, shell-less, timed and bounded', () => {
    const adapter = readFileSync(join(FEATURE, 'infrastructure', 'WindowsPortAdapter.ts'), 'utf8')

    for (const option of ['windowsHide: true', 'shell: false', 'timeout:', 'maxBuffer:']) {
      expect(adapter).toContain(option)
    }
  })
})
