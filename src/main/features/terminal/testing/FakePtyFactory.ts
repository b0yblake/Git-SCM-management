import type { Unsubscribe } from '@shared/contracts/events'
import type { CreatePtyOptions, PtyFactory, PtyProcess } from '../domain/PtyProcess'

/**
 * A PTY that records what was done to it and lets a test drive its output.
 *
 * `kill()` emits exit(0) synchronously, modelling "the process dies when you
 * kill it". To simulate a process dying on its own, call `emitExit()` directly.
 */
export class FakePtyProcess implements PtyProcess {
  readonly writes: string[] = []
  readonly resizes: Array<{ cols: number; rows: number }> = []
  killed = false
  exited = false

  readonly #dataListeners = new Set<(data: string) => void>()
  readonly #exitListeners = new Set<(exitCode: number) => void>()

  constructor(readonly options: CreatePtyOptions) {}

  /** How many listeners the manager currently holds on this PTY. */
  get listenerCount(): number {
    return this.#dataListeners.size + this.#exitListeners.size
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows })
  }

  kill(): void {
    if (this.killed) return
    this.killed = true
    this.emitExit(0)
  }

  onData(callback: (data: string) => void): Unsubscribe {
    this.#dataListeners.add(callback)
    return () => {
      this.#dataListeners.delete(callback)
    }
  }

  onExit(callback: (exitCode: number) => void): Unsubscribe {
    this.#exitListeners.add(callback)
    return () => {
      this.#exitListeners.delete(callback)
    }
  }

  emitData(data: string): void {
    for (const listener of [...this.#dataListeners]) listener(data)
  }

  emitExit(exitCode: number): void {
    if (this.exited) return
    this.exited = true
    for (const listener of [...this.#exitListeners]) listener(exitCode)
  }
}

export class FakePtyFactory implements PtyFactory {
  readonly created: FakePtyProcess[] = []

  /** Set to make the next `create()` throw, then reset itself. */
  failNextCreate: Error | null = null

  create(options: CreatePtyOptions): PtyProcess {
    if (this.failNextCreate) {
      const error = this.failNextCreate
      this.failNextCreate = null
      throw error
    }

    const process = new FakePtyProcess(options)
    this.created.push(process)
    return process
  }

  /** PTYs that were never killed and never exited. */
  get live(): FakePtyProcess[] {
    return this.created.filter((process) => !process.exited)
  }

  get last(): FakePtyProcess {
    const process = this.created.at(-1)
    if (!process) throw new Error('FakePtyFactory: nothing has been created yet')
    return process
  }

  at(index: number): FakePtyProcess {
    const process = this.created[index]
    if (!process) throw new Error(`FakePtyFactory: no PTY created at index ${index}`)
    return process
  }
}
