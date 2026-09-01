import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { combineSinks, createFileSink } from './fileSink'
import type { LogEntry, LogSink } from './logger'

/** Writes to a real temp directory — the filesystem is the thing under test. */
let directory: string
let filePath: string

const entry = (message: string, meta?: unknown): LogEntry =>
  meta === undefined ? { level: 'info', message } : { level: 'info', message, meta }

const lines = (): string[] =>
  readFileSync(filePath, 'utf8').split('\n').filter(Boolean)

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitdeck-logs-'))
  filePath = join(directory, 'nested', 'gitdeck.log')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('writing', () => {
  it('creates the directory and the file on the first line', () => {
    createFileSink({ filePath })(entry('app ready'))

    expect(existsSync(filePath)).toBe(true)
    expect(lines()).toHaveLength(1)
  })

  it('records the level, the message and a timestamp', () => {
    createFileSink({ filePath })({ level: 'warn', message: 'shell missing' })

    expect(lines()[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[warn] shell missing$/)
  })

  it('appends rather than replacing', () => {
    const sink = createFileSink({ filePath })

    sink(entry('first'))
    sink(entry('second'))

    expect(lines()).toHaveLength(2)
  })

  it('serialises meta onto the same line, so one event is one line', () => {
    createFileSink({ filePath })(entry('terminal created', { sessionId: 'sess_1' }))

    expect(lines()[0]).toContain('{"sessionId":"sess_1"}')
    expect(lines()).toHaveLength(1)
  })
})

describe('rotation', () => {
  it('keeps exactly one previous file once the limit is passed', () => {
    const sink = createFileSink({ filePath, maxBytes: 200 })
    for (let i = 0; i < 40; i++) sink(entry(`line ${i}`))

    const previous = join(directory, 'nested', 'gitdeck.previous.log')
    expect(existsSync(previous)).toBe(true)
    // A long session must not be able to fill the disk.
    expect(statSync(filePath).size).toBeLessThan(400)
  })

  it('does not rotate a file that is still small', () => {
    const sink = createFileSink({ filePath, maxBytes: 1_000_000 })
    sink(entry('one'))
    sink(entry('two'))

    expect(existsSync(join(directory, 'nested', 'gitdeck.previous.log'))).toBe(false)
  })
})

/** A crash caused by logging is worse than a lost log line. */
describe('when it cannot write', () => {
  it('swallows the failure rather than throwing into the caller', () => {
    // The parent of the log file is a file, so creating the directory fails.
    const blocked = join(directory, 'blocker')
    writeFileSync(blocked, 'not a directory', 'utf8')
    const sink = createFileSink({ filePath: join(blocked, 'gitdeck.log') })

    expect(() => sink(entry('app ready'))).not.toThrow()
  })
})

describe('combineSinks', () => {
  it('sends every entry to all of them', () => {
    const seen: string[][] = [[], []]
    const record = (index: number): LogSink => (e) => {
      seen[index]!.push(e.message)
    }

    combineSinks(record(0), record(1))(entry('both'))

    expect(seen).toEqual([['both'], ['both']])
  })

  it('the console and the file both receive it, which is the production wiring', () => {
    const captured: LogEntry[] = []
    const sink = combineSinks((e) => captured.push(e), createFileSink({ filePath }))

    sink(entry('app ready'))

    expect(captured).toHaveLength(1)
    expect(lines()).toHaveLength(1)
  })
})
