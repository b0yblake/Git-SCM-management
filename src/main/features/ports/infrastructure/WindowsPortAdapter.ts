import { execFile } from 'node:child_process'
import { join } from 'node:path'
import {
  PortAccessDeniedError,
  PortInspectionError,
  PortInspectionTimeoutError,
  PortTerminationError
} from '../domain/errors'
import type {
  PortAdapter,
  PortInspection,
  PortTerminationOutcome,
  RawPortBinding,
  RawProcessIdentity
} from '../domain/PortAdapter'

/**
 * The only module in the application allowed to run PowerShell or
 * `taskkill.exe`.
 *
 * Both commands are fixed: the inspection script is a constant, and the kill
 * argument list is `/PID <validated decimal> /F` and nothing else. No
 * renderer-supplied value is ever interpolated into either — `/IM`, `/T`,
 * wildcards, remote hosts, usernames and elevation do not exist here, and
 * `WindowsPortAdapter.spec.ts` scans this feature's production source to keep
 * that true.
 */

export const INSPECT_TIMEOUT_MS = 15_000
export const KILL_TIMEOUT_MS = 10_000
/** A full process table is tens of KB; a megabyte of headroom is generous. */
export const MAX_INSPECTION_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_KILL_OUTPUT_BYTES = 64 * 1024

const system32 = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32')
const POWERSHELL = join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const TASKKILL = join(system32, 'taskkill.exe')

/**
 * The fixed inspection script.
 *
 * TCP is filtered to `Listen` and established connections never leave
 * PowerShell — this modal is about what can be bound, not a connection
 * monitor. `-ErrorAction SilentlyContinue` on the two Net cmdlets matters:
 * with zero matches they raise a (non-terminating) error, and an empty machine
 * must produce an empty snapshot, not a failure. `StartTime` is read per
 * process under `try` because protected processes throw on it — `$null` there
 * is what makes a row visible but non-terminable.
 */
export const INSPECT_SCRIPT = [
  '$tcp = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess)',
  '$udp = @(Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess)',
  "$processes = @(Get-Process | Select-Object Id, ProcessName, SessionId, @{ Name = 'StartTime'; Expression = { try { [long](($_.StartTime.ToUniversalTime() - [datetime]'1970-01-01T00:00:00Z').TotalMilliseconds) } catch { $null } } })",
  '@{ tcp = $tcp; udp = $udp; processes = $processes } | ConvertTo-Json -Depth 4 -Compress'
].join('; ')

export const INSPECT_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  INSPECT_SCRIPT
] as const

/** How one command run ended, with the two kill reasons kept apart. */
export type PortCommandOutcome =
  | { readonly kind: 'ok'; readonly stdout: string }
  | {
      readonly kind: 'exit'
      readonly code: number
      readonly stdout: string
      readonly stderr: string
    }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'oversized' }
  | { readonly kind: 'spawn-failed'; readonly reason: string }

export interface PortCommandLimits {
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

/** Runs a command. Injected so argument construction is testable without the OS. */
export type PortCommandRunner = (
  file: string,
  args: readonly string[],
  limits: PortCommandLimits
) => Promise<PortCommandOutcome>

export const createPortCommandRunner =
  (): PortCommandRunner =>
  (file, args, { timeoutMs, maxOutputBytes }) =>
    new Promise((resolve) => {
      execFile(
        file,
        [...args],
        // `timeout` kills the child when it runs long; `maxBuffer` kills it
        // when it floods; `windowsHide` keeps the console window invisible;
        // `shell: false` means arguments can never be reinterpreted.
        {
          windowsHide: true,
          shell: false,
          timeout: timeoutMs,
          maxBuffer: maxOutputBytes,
          encoding: 'utf8'
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ kind: 'ok', stdout })
            return
          }

          const failure = error as NodeJS.ErrnoException & { killed?: boolean }
          if (
            failure.code === 'ERR_CHILD_PROCESS_STDOUT_MAXBUFFER' ||
            failure.code === 'ERR_CHILD_PROCESS_STDERR_MAXBUFFER'
          ) {
            resolve({ kind: 'oversized' })
            return
          }
          if (failure.killed) {
            resolve({ kind: 'timeout' })
            return
          }
          if (typeof failure.code === 'number') {
            resolve({
              kind: 'exit',
              code: failure.code,
              stdout: stdout ?? '',
              stderr: stderr ?? ''
            })
            return
          }
          resolve({ kind: 'spawn-failed', reason: String(failure.code ?? failure.message) })
        }
      )
    })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Windows PowerShell 5.1's `ConvertTo-Json` unwraps a nested one-element array
 * to its single element. That is the documented output format here, not
 * corruption — so a lone object is re-wrapped rather than rejected.
 */
const asRows = (value: unknown, field: string): readonly unknown[] => {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value
  if (isRecord(value)) return [value]
  throw new PortInspectionError(`field ${field} has an unexpected shape`)
}

const asPort = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new PortInspectionError(`field ${field} is not a port number`)
  }
  return value
}

const asPid = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new PortInspectionError(`field ${field} is not a PID`)
  }
  return value
}

const parseBinding = (protocol: 'tcp' | 'udp', row: unknown): RawPortBinding => {
  if (!isRecord(row)) throw new PortInspectionError('a binding row is not an object')
  const address = row['LocalAddress']
  if (typeof address !== 'string' || address.length === 0) {
    throw new PortInspectionError('a binding row has no local address')
  }
  return {
    protocol,
    localAddress: address,
    localPort: asPort(row['LocalPort'], 'LocalPort'),
    pid: asPid(row['OwningProcess'], 'OwningProcess')
  }
}

/**
 * Bindings parse strictly — they gate a destructive action. Process metadata
 * parses leniently to `null` — an unreadable name or start time must keep the
 * row visible as `Unknown` and non-terminable, not fail the inspection.
 */
const parseProcess = (row: unknown): RawProcessIdentity => {
  if (!isRecord(row)) throw new PortInspectionError('a process row is not an object')
  const name = row['ProcessName']
  const startedAt = row['StartTime']
  const sessionId = row['SessionId']
  return {
    pid: asPid(row['Id'], 'Id'),
    name: typeof name === 'string' && name.length > 0 ? name : null,
    startedAt: typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : null,
    sessionId: typeof sessionId === 'number' && Number.isInteger(sessionId) ? sessionId : null
  }
}

/** Exported for the unit suite; throws `PortInspectionError` on anything malformed. */
export const parseInspectionJson = (stdout: string): PortInspection => {
  let root: unknown
  try {
    root = JSON.parse(stdout)
  } catch {
    throw new PortInspectionError('output is not valid JSON')
  }
  if (!isRecord(root)) throw new PortInspectionError('output is not an object')

  return {
    bindings: [
      ...asRows(root['tcp'], 'tcp').map((row) => parseBinding('tcp', row)),
      ...asRows(root['udp'], 'udp').map((row) => parseBinding('udp', row))
    ],
    processes: asRows(root['processes'], 'processes').map(parseProcess)
  }
}

export interface WindowsPortAdapterOptions {
  readonly run?: PortCommandRunner
  readonly inspectTimeoutMs?: number
  readonly killTimeoutMs?: number
}

export const createWindowsPortAdapter = ({
  run = createPortCommandRunner(),
  inspectTimeoutMs = INSPECT_TIMEOUT_MS,
  killTimeoutMs = KILL_TIMEOUT_MS
}: WindowsPortAdapterOptions = {}): PortAdapter => ({
  inspect: async (): Promise<PortInspection> => {
    const outcome = await run(POWERSHELL, INSPECT_ARGS, {
      timeoutMs: inspectTimeoutMs,
      maxOutputBytes: MAX_INSPECTION_OUTPUT_BYTES
    })

    switch (outcome.kind) {
      case 'ok':
        return parseInspectionJson(outcome.stdout)
      case 'timeout':
        throw new PortInspectionTimeoutError(inspectTimeoutMs)
      case 'oversized':
        throw new PortInspectionError('output exceeded the size limit')
      case 'spawn-failed':
        throw new PortInspectionError(`PowerShell could not be started (${outcome.reason})`)
      case 'exit':
        // A missing NetTCPIP cmdlet lands here: the script fails, and the
        // answer is a handled inspection error, not a crash.
        throw new PortInspectionError(`the inspection script failed (exit ${outcome.code})`)
    }
  },

  terminate: async (pid: number): Promise<PortTerminationOutcome> => {
    // The service never sends these; the adapter still refuses to build the
    // command. PID 0/4 are Windows itself, and a non-integer is not a PID.
    if (!Number.isInteger(pid) || pid <= 4) {
      throw new PortTerminationError(`refused to run taskkill against pid ${pid}`)
    }

    // Exactly this, always: the specific process, forcefully. No `/IM` (kills
    // by image name), no `/T` (kills the whole tree), no remote/user options.
    const outcome = await run(TASKKILL, ['/PID', String(pid), '/F'], {
      timeoutMs: killTimeoutMs,
      maxOutputBytes: MAX_KILL_OUTPUT_BYTES
    })

    switch (outcome.kind) {
      case 'ok':
        return 'terminated'
      case 'timeout':
        throw new PortTerminationError('taskkill did not finish in time')
      case 'oversized':
        throw new PortTerminationError('taskkill produced unexpected output')
      case 'spawn-failed':
        throw new PortTerminationError(`taskkill could not be started (${outcome.reason})`)
      case 'exit': {
        const text = `${outcome.stderr} ${outcome.stdout}`
        // 128 is taskkill's "no such process" — a harmless race, not a failure.
        if (outcome.code === 128 || /not found/i.test(text)) return 'already-exited'
        if (/denied/i.test(text)) throw new PortAccessDeniedError()
        throw new PortTerminationError(`taskkill exited ${outcome.code}`)
      }
    }
  }
})
