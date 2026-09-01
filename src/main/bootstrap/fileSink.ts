import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LogEntry, LogSink } from './logger'

/** Rotated at this size, keeping exactly one previous file. */
export const MAX_LOG_BYTES = 1_000_000

export interface FileSinkOptions {
  readonly filePath: string
  readonly maxBytes?: number
}

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/**
 * Writes log lines to disk.
 *
 * A packaged Windows app has no console, so `consoleSink` is invisible the
 * moment the app leaves the dev environment — which is exactly when a log is
 * most needed. Lines are appended synchronously: the volume is a handful per
 * session, and a buffered write would be lost in the crash it was recording.
 *
 * Writing must never break the app, so every failure here is swallowed. A lost
 * log line is a worse outcome than nothing only in theory; a crash caused by
 * logging is worse in practice.
 */
export const createFileSink = ({ filePath, maxBytes = MAX_LOG_BYTES }: FileSinkOptions): LogSink => {
  let ready = false

  return ({ level, message, meta }: LogEntry): void => {
    try {
      if (!ready) {
        mkdirSync(dirname(filePath), { recursive: true })
        ready = true
      }

      // One previous file is kept, so a long-running session cannot fill the
      // disk and a crash still has the run before it for context.
      if (sizeOf(filePath) >= maxBytes) {
        renameSync(filePath, join(dirname(filePath), 'gitdeck.previous.log'))
      }

      const at = new Date().toISOString()
      const suffix = meta === undefined ? '' : ` ${JSON.stringify(meta)}`
      appendFileSync(filePath, `${at} [${level}] ${message}${suffix}\n`, 'utf8')
    } catch {
      // Deliberately silent: see above.
    }
  }
}

/** Sends every entry to all of them. */
export const combineSinks =
  (...sinks: readonly LogSink[]): LogSink =>
  (entry) => {
    for (const sink of sinks) sink(entry)
  }
