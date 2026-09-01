import type { LogEntry, Logger } from '../bootstrap/logger'

export interface FakeLogger extends Logger {
  readonly entries: LogEntry[]
  entriesAt(level: LogEntry['level']): LogEntry[]
  clear(): void
}

/**
 * Captures log entries so a test can assert that a failure was reported.
 * Applies no sanitization — tests assert on exactly what the caller passed.
 */
export const createFakeLogger = (): FakeLogger => {
  const entries: LogEntry[] = []
  const push =
    (level: LogEntry['level']) =>
    (message: string, meta?: unknown): void => {
      entries.push(meta === undefined ? { level, message } : { level, message, meta })
    }

  return {
    entries,
    debug: push('debug'),
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
    entriesAt: (level) => entries.filter((entry) => entry.level === level),
    clear: () => {
      entries.length = 0
    }
  }
}
