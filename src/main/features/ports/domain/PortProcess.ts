import type { PortBinding, PortTerminationBlockReason } from '@shared/contracts/ports'
import type { PortInspection, RawPortBinding, RawProcessIdentity } from './PortAdapter'

/** What the UI shows when the OS would not reveal a process name. */
export const UNKNOWN_PROCESS_NAME = 'Unknown'

/**
 * A process row before Main mints its capability: everything in the shared
 * `PortProcess` contract except `targetId`, which is identity and therefore
 * `PortService`'s to issue.
 */
export interface GroupedPortProcess {
  readonly pid: number
  readonly processName: string
  readonly startedAt: number | null
  readonly bindings: readonly PortBinding[]
  readonly canTerminate: boolean
  readonly blockedReason?: PortTerminationBlockReason
}

/** PIDs that are Windows itself. 0 is Idle, 4 is System. */
const SYSTEM_PIDS = new Set([0, 4])

const PROTOCOL_ORDER = { tcp: 0, udp: 1 } as const

export const sameBinding = (a: PortBinding, b: PortBinding): boolean =>
  a.protocol === b.protocol && a.localAddress === b.localAddress && a.localPort === b.localPort

/** Code-unit comparison: `localeCompare` would order by the machine's locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const compareBindings = (a: PortBinding, b: PortBinding): number =>
  a.localPort - b.localPort ||
  PROTOCOL_ORDER[a.protocol] - PROTOCOL_ORDER[b.protocol] ||
  byText(a.localAddress, b.localAddress)

/**
 * Why a process may not be terminated, or null when it may be.
 *
 * These rules are the safety floor and belong to Main alone — they hold even
 * against a compromised renderer, because a blocked process never receives a
 * usable capability in the first place.
 */
const blockReasonFor = (
  pid: number,
  identity: RawProcessIdentity | undefined,
  ownPid: number,
  ownSessionId: number | null
): PortTerminationBlockReason | null => {
  if (SYSTEM_PIDS.has(pid)) return 'system-process'
  if (pid === ownPid) return 'gitdeck-process'
  // No identity means no name to confirm and no start time to revalidate
  // against PID reuse — killing such a process would be killing blind.
  if (!identity || identity.name === null || identity.startedAt === null) {
    return 'identity-unavailable'
  }
  if (identity.sessionId === null) return 'identity-unavailable'
  // Fail closed: if GitDeck's own session cannot be established, nothing can
  // be proven to share it.
  if (ownSessionId === null || identity.sessionId !== ownSessionId) return 'different-session'
  return null
}

/**
 * Turns raw OS output into the rows the modal renders: one row per owning
 * process, bindings deduplicated and deterministically ordered, and the
 * termination verdict already made.
 *
 * Ordering is lowest owned port, then process name, then PID — stable across
 * refreshes so the list does not reshuffle under the user's pointer.
 */
export const groupPortProcesses = (
  inspection: PortInspection,
  ownPid: number
): readonly GroupedPortProcess[] => {
  const identities = new Map(inspection.processes.map((process) => [process.pid, process]))
  const ownSessionId = identities.get(ownPid)?.sessionId ?? null

  const byPid = new Map<number, RawPortBinding[]>()
  for (const binding of inspection.bindings) {
    byPid.set(binding.pid, [...(byPid.get(binding.pid) ?? []), binding])
  }

  const rows = [...byPid.entries()].map(([pid, owned]): GroupedPortProcess => {
    // The same socket can be reported twice; showing it twice would be noise,
    // and IPv4/IPv6 siblings differ by address so they both survive this.
    const bindings = owned
      .map(({ protocol, localAddress, localPort }): PortBinding => ({
        protocol,
        localAddress,
        localPort
      }))
      .filter((binding, index, all) => all.findIndex((b) => sameBinding(b, binding)) === index)
      .sort(compareBindings)

    const identity = identities.get(pid)
    const blockedReason = blockReasonFor(pid, identity, ownPid, ownSessionId)

    return {
      pid,
      processName: identity?.name ?? UNKNOWN_PROCESS_NAME,
      startedAt: identity?.startedAt ?? null,
      bindings,
      canTerminate: blockedReason === null,
      ...(blockedReason === null ? {} : { blockedReason })
    }
  })

  return rows.sort(
    (a, b) =>
      (a.bindings[0]?.localPort ?? 0) - (b.bindings[0]?.localPort ?? 0) ||
      byText(a.processName, b.processName) ||
      a.pid - b.pid
  )
}
