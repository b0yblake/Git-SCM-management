import type {
  PortAdapter,
  PortInspection,
  PortTerminationOutcome,
  RawPortBinding,
  RawProcessIdentity
} from '../domain/PortAdapter'

/** Shorthand builders so specs read as data, not as ceremony. */
export const binding = (
  protocol: 'tcp' | 'udp',
  localAddress: string,
  localPort: number,
  pid: number
): RawPortBinding => ({ protocol, localAddress, localPort, pid })

export const identity = (
  pid: number,
  name: string | null,
  startedAt: number | null = 1_000,
  sessionId: number | null = 1
): RawProcessIdentity => ({ pid, name, startedAt, sessionId })

export interface FakePortAdapter extends PortAdapter {
  /**
   * Scripts what successive `inspect()` calls answer. The last entry repeats,
   * so a service that inspects for list, revalidation and verification can be
   * scripted with exactly the states each look should see.
   */
  scriptInspections(...inspections: PortInspection[]): void
  /** Makes the next `inspect()` throw, once, before any scripted answer. */
  failNextInspection(error: Error): void
  /** What `terminate(pid)` does for this pid; default is `'terminated'`. */
  scriptTermination(pid: number, outcome: PortTerminationOutcome | Error): void
  /** Every pid the service actually asked to kill, in order. */
  readonly terminateCalls: number[]
  inspectCount(): number
}

export const createFakePortAdapter = (): FakePortAdapter => {
  const inspections: PortInspection[] = [{ bindings: [], processes: [] }]
  const inspectionFailures: Error[] = []
  const terminations = new Map<number, PortTerminationOutcome | Error>()
  const terminateCalls: number[] = []
  let inspected = 0

  return {
    inspect: () => {
      inspected += 1
      const failure = inspectionFailures.shift()
      if (failure) return Promise.reject(failure)
      const next = inspections.length > 1 ? inspections.shift() : inspections[0]
      return Promise.resolve(next ?? { bindings: [], processes: [] })
    },

    terminate: (pid) => {
      terminateCalls.push(pid)
      const outcome = terminations.get(pid) ?? 'terminated'
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
    },

    scriptInspections: (...scripted) => {
      inspections.splice(0, inspections.length, ...scripted)
    },
    failNextInspection: (error) => {
      inspectionFailures.push(error)
    },
    scriptTermination: (pid, outcome) => {
      terminations.set(pid, outcome)
    },
    terminateCalls,
    inspectCount: () => inspected
  }
}
