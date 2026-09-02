import type { Unsubscribe } from '@shared/contracts/events'

/**
 * One bridge subscription for every terminal view (performance, 2026-09-02).
 *
 * Before this, each mounted terminal registered its own `onData`/`onExit` on
 * the bridge and filtered by session id. Every PTY byte then crossed the
 * contextBridge once *per terminal* and ran N comparisons — O(N) work per
 * chunk that grew with the session count, plus Node's MaxListeners warning
 * past ten terminals. The hub subscribes exactly once and routes each event
 * with one Map lookup, so dispatch cost stays flat no matter how many
 * terminals are open.
 *
 * The root subscriptions are released when the last consumer leaves, so
 * "everything unsubscribed after unmount" stays true for the whole app — the
 * cleanup guarantee the test suite asserts on.
 */

type DataHandler = (data: string) => void
type ExitHandler = (exitCode: number) => void

const dataHandlers = new Map<string, Set<DataHandler>>()
const exitHandlers = new Map<string, Set<ExitHandler>>()
let rootData: Unsubscribe | null = null
let rootExit: Unsubscribe | null = null

const ensureRoots = (): void => {
  rootData ??= window.gitdeck.terminal.onData((event) => {
    const handlers = dataHandlers.get(event.sessionId)
    if (!handlers) return
    for (const handler of [...handlers]) handler(event.data)
  })
  rootExit ??= window.gitdeck.terminal.onExit((event) => {
    const handlers = exitHandlers.get(event.sessionId)
    if (!handlers) return
    for (const handler of [...handlers]) handler(event.exitCode)
  })
}

const releaseRootsWhenIdle = (): void => {
  if (dataHandlers.size > 0 || exitHandlers.size > 0) return
  rootData?.()
  rootExit?.()
  rootData = null
  rootExit = null
}

const subscribe = <T>(
  registry: Map<string, Set<T>>,
  sessionId: string,
  handler: T
): Unsubscribe => {
  ensureRoots()
  let handlers = registry.get(sessionId)
  if (!handlers) {
    handlers = new Set<T>()
    registry.set(sessionId, handlers)
  }
  handlers.add(handler)

  return () => {
    const current = registry.get(sessionId)
    if (!current) return
    current.delete(handler)
    if (current.size === 0) registry.delete(sessionId)
    releaseRootsWhenIdle()
  }
}

/** Delivers this session's PTY output only. */
export const onSessionData = (sessionId: string, handler: DataHandler): Unsubscribe =>
  subscribe(dataHandlers, sessionId, handler)

/** Delivers this session's exit only. */
export const onSessionExit = (sessionId: string, handler: ExitHandler): Unsubscribe =>
  subscribe(exitHandlers, sessionId, handler)
