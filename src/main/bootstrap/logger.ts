export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly meta?: unknown
}

export type LogSink = (entry: LogEntry) => void

export interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

/**
 * Keys whose values are never written to a log (ARCHITECTURE.md §10 — "Never
 * log full environment variables"). `env` is the one that matters in practice:
 * it is how `process.env` reaches a log line.
 */
const REDACTED_KEYS = /^(env|token|secret|password|passwd|apikey|api_key|authorization|cookie)$/i

export const REDACTED = '[redacted]'

/**
 * Makes `meta` safe and serializable: redacts sensitive keys, unwraps Errors,
 * and replaces cycles rather than throwing on them.
 */
export const sanitize = (meta: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
  if (meta === null || typeof meta !== 'object') return meta

  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message }
  }

  if (seen.has(meta)) return '[circular]'
  seen.add(meta)

  if (Array.isArray(meta)) {
    return meta.map((item) => sanitize(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    result[key] = REDACTED_KEYS.test(key) ? REDACTED : sanitize(value, seen)
  }
  return result
}

export const createLogger = (sink: LogSink): Logger => {
  const log =
    (level: LogLevel) =>
    (message: string, meta?: unknown): void => {
      sink(meta === undefined ? { level, message } : { level, message, meta: sanitize(meta) })
    }

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error')
  }
}

export const consoleSink: LogSink = ({ level, message, meta }) => {
  const line = `[${level}] ${message}`
  if (meta === undefined) console[level](line)
  else console[level](line, meta)
}
