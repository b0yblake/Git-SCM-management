import {
  PORT_SNAPSHOT_TTL_MS,
  type PortProcess,
  type PortSnapshot,
  type PortTerminationFailure,
  type TerminatePortProcessesRequest,
  type TerminatePortProcessesResult
} from '@shared/contracts/ports'
import { createId } from '@shared/domain/ids'
import type { Logger } from '@main/bootstrap/logger'
import {
  InvalidPortRequestError,
  PortAccessDeniedError,
  PortSnapshotStaleError
} from '../domain/errors'
import type { PortAdapter, PortInspection } from '../domain/PortAdapter'
import { groupPortProcesses, sameBinding } from '../domain/PortProcess'

export interface PortServiceOptions {
  /** GitDeck's own Main PID — never terminable. */
  readonly ownPid: number
  readonly snapshotTtlMs?: number
  readonly now?: () => number
  readonly newSnapshotId?: () => string
  readonly newTargetId?: () => string
}

interface StoredSnapshot {
  readonly id: string
  readonly capturedAt: number
  readonly targets: ReadonlyMap<string, PortProcess>
}

/**
 * Owns the one in-memory snapshot and the capability discipline around it.
 *
 * A terminate request may only name `targetId`s minted here, in the current,
 * unexpired snapshot — the renderer never holds anything the OS understands.
 * A refresh invalidates the previous snapshot, a terminate consumes it, and
 * nothing keeps a history: five minutes after `list()`, every capability it
 * issued is dead.
 */
export class PortService {
  readonly #adapter: PortAdapter
  readonly #logger: Logger
  readonly #ownPid: number
  readonly #ttl: number
  readonly #now: () => number
  readonly #newSnapshotId: () => string
  readonly #newTargetId: () => string
  #current: StoredSnapshot | null = null

  constructor(adapter: PortAdapter, logger: Logger, options: PortServiceOptions) {
    this.#adapter = adapter
    this.#logger = logger
    this.#ownPid = options.ownPid
    this.#ttl = options.snapshotTtlMs ?? PORT_SNAPSHOT_TTL_MS
    this.#now = options.now ?? Date.now
    this.#newSnapshotId = options.newSnapshotId ?? (() => createId('snap'))
    this.#newTargetId = options.newTargetId ?? (() => createId('target'))
  }

  /** Enumerates ports and mints a fresh snapshot, invalidating the previous one. */
  async list(): Promise<PortSnapshot> {
    const inspection = await this.#adapter.inspect()

    const processes: readonly PortProcess[] = groupPortProcesses(inspection, this.#ownPid).map(
      (row) => ({ targetId: this.#newTargetId(), ...row })
    )

    this.#current = {
      id: this.#newSnapshotId(),
      capturedAt: this.#now(),
      targets: new Map(processes.map((process) => [process.targetId, process]))
    }

    this.#logger.info('ports inspected', {
      processes: processes.length,
      bindings: processes.reduce((sum, process) => sum + process.bindings.length, 0)
    })

    return { id: this.#current.id, capturedAt: this.#current.capturedAt, processes }
  }

  /**
   * Terminates the selected processes, independently of one another.
   *
   * The order of defenses: the snapshot must be the current, unexpired one;
   * every target must be a capability it minted, for a process it marked
   * terminable; the snapshot is then consumed; each PID is revalidated against
   * a fresh inspection (same start time, still owns a snapshotted binding)
   * immediately before `taskkill`; and success is only reported once a final
   * inspection proves the snapshotted bindings are gone.
   */
  async terminate(request: TerminatePortProcessesRequest): Promise<TerminatePortProcessesResult> {
    const current = this.#current
    if (
      current === null ||
      current.id !== request.snapshotId ||
      this.#now() - current.capturedAt > this.#ttl
    ) {
      throw new PortSnapshotStaleError()
    }

    // Duplicate selections collapse here, so one process is killed at most
    // once no matter what the request repeats.
    const targets = [...new Set(request.targetIds)].map((targetId) => {
      const target = current.targets.get(targetId)
      if (!target) throw new InvalidPortRequestError('unknown target id')
      if (!target.canTerminate) {
        throw new InvalidPortRequestError(`${target.processName} is not terminable`)
      }
      return target
    })

    // Consumed: a capability authorizes at most one attempt.
    this.#current = null

    // Revalidation inspection — nothing has been killed yet, so a failure here
    // simply aborts with a handled error.
    const fresh = await this.#adapter.inspect()

    const terminatedTargetIds: string[] = []
    const alreadyExitedTargetIds: string[] = []
    const failures: PortTerminationFailure[] = []
    const killed: PortProcess[] = []

    for (const target of targets) {
      const verdict = this.#revalidate(target, fresh)

      if (verdict === 'exited') {
        alreadyExitedTargetIds.push(target.targetId)
        continue
      }
      if (verdict !== 'kill') {
        failures.push({
          targetId: target.targetId,
          code: verdict,
          message:
            verdict === 'stale-identity'
              ? `PID ${target.pid} is no longer ${target.processName} — refresh and select again.`
              : `${target.processName} no longer owns the listed port(s) — refresh and select again.`
        })
        continue
      }

      try {
        const outcome = await this.#adapter.terminate(target.pid)
        if (outcome === 'already-exited') alreadyExitedTargetIds.push(target.targetId)
        else killed.push(target)
      } catch (error) {
        // One refusal must not abort the rest of the selection.
        failures.push({
          targetId: target.targetId,
          code: error instanceof PortAccessDeniedError ? 'access-denied' : 'termination-failed',
          message: error instanceof Error ? error.message : 'The process could not be terminated.'
        })
      }
    }

    // Success is "the port was released", not "taskkill exited zero".
    if (killed.length > 0) {
      let after: PortInspection | null
      try {
        after = await this.#adapter.inspect()
      } catch {
        after = null
      }

      for (const target of killed) {
        if (after === null) {
          failures.push({
            targetId: target.targetId,
            code: 'verify-failed',
            message: `${target.processName} was signalled, but the result could not be verified.`
          })
        } else if (this.#stillOwnsABinding(target, after)) {
          failures.push({
            targetId: target.targetId,
            code: 'not-released',
            message: `${target.processName} was signalled but still holds its port(s).`
          })
        } else {
          terminatedTargetIds.push(target.targetId)
        }
      }
    }

    this.#logger.info('port termination finished', {
      requested: targets.length,
      terminated: terminatedTargetIds.length,
      alreadyExited: alreadyExitedTargetIds.length,
      failed: failures.map(({ code }) => code)
    })

    return { terminatedTargetIds, alreadyExitedTargetIds, failures }
  }

  /**
   * The last look before the kill. A recycled PID shows a different start
   * time; a process that let go of its ports since the snapshot is not the
   * problem the user selected. Either way: never killed.
   */
  #revalidate(
    target: PortProcess,
    fresh: PortInspection
  ): 'kill' | 'exited' | 'stale-identity' | 'stale-bindings' {
    const identity = fresh.processes.find((process) => process.pid === target.pid)
    if (!identity) return 'exited'
    if (
      identity.startedAt === null ||
      target.startedAt === null ||
      identity.startedAt !== target.startedAt
    ) {
      return 'stale-identity'
    }
    if (!this.#stillOwnsABinding(target, fresh)) return 'stale-bindings'
    return 'kill'
  }

  #stillOwnsABinding(target: PortProcess, inspection: PortInspection): boolean {
    return inspection.bindings.some(
      (raw) =>
        raw.pid === target.pid && target.bindings.some((binding) => sameBinding(binding, raw))
    )
  }
}
