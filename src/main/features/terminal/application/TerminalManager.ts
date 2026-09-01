import type { Unsubscribe } from '@shared/contracts/events'
import { createId } from '@shared/domain/ids'
import type { Logger } from '@main/bootstrap/logger'
import type { PtyFactory, PtyProcess } from '../domain/PtyProcess'
import { TerminalSessionNotFoundError } from '../domain/errors'
import type {
  TerminalDataEvent,
  TerminalDefinition,
  TerminalExitEvent,
  TerminalSessionInfo,
  TerminalSessionStatus,
  TerminalSize
} from '../domain/TerminalSession'

interface Session {
  readonly id: string
  readonly definition: TerminalDefinition
  readonly createdAt: number
  readonly pty: PtyProcess
  status: TerminalSessionStatus
  exitCode?: number
  detach: Unsubscribe[]
}

/** `exactOptionalPropertyTypes` forbids assigning an explicit `undefined`. */
const toInfo = (session: Session): TerminalSessionInfo =>
  session.exitCode === undefined
    ? {
        id: session.id,
        definition: session.definition,
        status: session.status,
        createdAt: session.createdAt
      }
    : {
        id: session.id,
        definition: session.definition,
        status: session.status,
        exitCode: session.exitCode,
        createdAt: session.createdAt
      }

/**
 * Owns every live PTY in the application.
 *
 * Depends only on `PtyFactory`, never on `node-pty` — that is what makes the
 * whole lifecycle testable without spawning a shell.
 */
export class TerminalManager {
  readonly #sessions = new Map<string, Session>()
  readonly #dataListeners = new Set<(event: TerminalDataEvent) => void>()
  readonly #exitListeners = new Set<(event: TerminalExitEvent) => void>()
  readonly #ptyFactory: PtyFactory
  readonly #logger: Logger

  constructor(ptyFactory: PtyFactory, logger: Logger) {
    this.#ptyFactory = ptyFactory
    this.#logger = logger
  }

  create(definition: TerminalDefinition, size: TerminalSize): TerminalSessionInfo {
    const id = createId('sess')
    const createdAt = Date.now()

    let pty: PtyProcess
    try {
      pty = this.#ptyFactory.create({
        shellProfileId: definition.shellProfileId,
        cwd: definition.cwd,
        cols: size.cols,
        rows: size.rows
      })
    } catch (error) {
      // No session is registered: a failed spawn must not leave an orphan entry
      // that later reads as a live terminal.
      this.#logger.error('terminal create failed', {
        sessionId: id,
        shellProfileId: definition.shellProfileId,
        cwd: definition.cwd,
        error
      })
      return { id, definition, status: 'failed', createdAt }
    }

    const session: Session = {
      id,
      definition,
      createdAt,
      pty,
      status: 'running',
      detach: []
    }
    this.#sessions.set(id, session)

    session.detach.push(
      pty.onData((data) => {
        this.#emit(this.#dataListeners, { sessionId: id, data })
      }),
      pty.onExit((exitCode) => {
        this.#handleExit(id, exitCode)
      })
    )

    this.#logger.info('terminal created', {
      sessionId: id,
      shellProfileId: definition.shellProfileId,
      cwd: definition.cwd
    })

    return toInfo(session)
  }

  write(sessionId: string, data: string): void {
    const session = this.#require(sessionId)
    if (session.status !== 'running') {
      // The process can exit between a keystroke and its delivery; writing to a
      // dead PTY throws, and a lost keystroke is the better outcome.
      this.#logger.debug('write to a terminal that is not running', {
        sessionId,
        status: session.status
      })
      return
    }
    session.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.#require(sessionId)
    if (session.status !== 'running') return
    session.pty.resize(cols, rows)
  }

  kill(sessionId: string): void {
    const session = this.#require(sessionId)
    if (session.status !== 'running') return
    session.pty.kill()
  }

  get(sessionId: string): TerminalSessionInfo {
    return toInfo(this.#require(sessionId))
  }

  list(): TerminalSessionInfo[] {
    return [...this.#sessions.values()].map(toInfo)
  }

  onData(callback: (event: TerminalDataEvent) => void): Unsubscribe {
    this.#dataListeners.add(callback)
    return () => {
      this.#dataListeners.delete(callback)
    }
  }

  onExit(callback: (event: TerminalExitEvent) => void): Unsubscribe {
    this.#exitListeners.add(callback)
    return () => {
      this.#exitListeners.delete(callback)
    }
  }

  /** Kills every live session. Safe to call more than once. */
  disposeAll(): void {
    for (const session of this.#sessions.values()) {
      if (session.status !== 'running') continue
      // Detach first: shutdown must not fan exit events out to listeners that
      // are themselves being torn down.
      this.#detach(session)
      try {
        session.pty.kill()
      } catch (error) {
        this.#logger.warn('failed to kill terminal during shutdown', {
          sessionId: session.id,
          error
        })
      }
      session.status = 'exited'
    }

    this.#sessions.clear()
    this.#dataListeners.clear()
    this.#exitListeners.clear()
  }

  #handleExit(sessionId: string, exitCode: number): void {
    const session = this.#sessions.get(sessionId)
    if (!session || session.status !== 'running') return

    session.status = 'exited'
    session.exitCode = exitCode
    this.#detach(session)

    this.#logger.info('terminal exited', { sessionId, exitCode })
    this.#emit(this.#exitListeners, { sessionId, exitCode })
  }

  #detach(session: Session): void {
    for (const unsubscribe of session.detach) unsubscribe()
    session.detach = []
  }

  #require(sessionId: string): Session {
    const session = this.#sessions.get(sessionId)
    if (!session) throw new TerminalSessionNotFoundError(sessionId)
    return session
  }

  /** Copies the set so a listener unsubscribing mid-dispatch cannot skip another. */
  #emit<T>(listeners: Set<(event: T) => void>, event: T): void {
    for (const listener of [...listeners]) listener(event)
  }
}
