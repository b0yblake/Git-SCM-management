import type { Unsubscribe } from '@shared/contracts/events'
import type { ShellProfileId } from './TerminalSession'

export interface CreatePtyOptions {
  readonly shellProfileId: ShellProfileId
  readonly cwd: string
  readonly cols: number
  readonly rows: number
}

/**
 * A running pseudo-terminal, reduced to what the application layer needs.
 *
 * This interface is the seam that lets `TerminalManager` be tested without
 * launching a shell — see `testing/FakePtyFactory.ts`.
 */
export interface PtyProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): Unsubscribe
  onExit(callback: (exitCode: number) => void): Unsubscribe
}

export interface PtyFactory {
  create(options: CreatePtyOptions): PtyProcess
}
