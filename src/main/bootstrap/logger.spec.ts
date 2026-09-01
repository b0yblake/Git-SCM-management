import { describe, expect, it } from 'vitest'
import { createFakeLogger } from '../testing/FakeLogger'
import { createLogger, REDACTED, sanitize, type LogEntry, type LogLevel } from './logger'

const collect = (): { entries: LogEntry[]; logger: ReturnType<typeof createLogger> } => {
  const entries: LogEntry[] = []
  return { entries, logger: createLogger((entry) => entries.push(entry)) }
}

describe('createLogger', () => {
  it.each<LogLevel>(['debug', 'info', 'warn', 'error'])(
    'forwards %s to the sink with its level',
    (level) => {
      const { entries, logger } = collect()

      logger[level]('something happened')

      expect(entries).toEqual([{ level, message: 'something happened' }])
    }
  )

  it('omits meta entirely when none is given', () => {
    const { entries, logger } = collect()

    logger.info('no meta')

    expect(entries[0]).not.toHaveProperty('meta')
  })

  it('passes sanitized meta through to the sink', () => {
    const { entries, logger } = collect()

    logger.warn('shell detection failed', { profileId: 'pwsh', attempts: 2 })

    expect(entries[0]?.meta).toEqual({ profileId: 'pwsh', attempts: 2 })
  })
})

describe('sanitize', () => {
  it('does not throw on a circular object', () => {
    const node: Record<string, unknown> = { name: 'root' }
    node['self'] = node

    expect(() => sanitize(node)).not.toThrow()
    expect(sanitize(node)).toEqual({ name: 'root', self: '[circular]' })
  })

  it('redacts an env bag rather than logging it verbatim', () => {
    const secretValue = 'super-secret-token-value'

    const result = sanitize({
      command: 'bash.exe',
      env: { PATH: 'C:\\Windows', GITHUB_TOKEN: secretValue }
    }) as Record<string, unknown>

    expect(result['env']).toBe(REDACTED)
    expect(JSON.stringify(result)).not.toContain(secretValue)
    expect(JSON.stringify(result)).not.toContain('C:\\Windows')
  })

  it.each(['token', 'secret', 'password', 'apiKey', 'authorization', 'cookie'])(
    'redacts the `%s` key',
    (key) => {
      const result = sanitize({ [key]: 'sensitive' }) as Record<string, unknown>

      expect(result[key]).toBe(REDACTED)
    }
  )

  it('redacts nested occurrences too', () => {
    const result = sanitize({ spawn: { cwd: 'D:\\proj', env: { A: '1' } } }) as {
      spawn: Record<string, unknown>
    }

    expect(result.spawn['cwd']).toBe('D:\\proj')
    expect(result.spawn['env']).toBe(REDACTED)
  })

  it('unwraps an Error into a serializable shape', () => {
    expect(sanitize(new TypeError('bad input'))).toEqual({
      name: 'TypeError',
      message: 'bad input'
    })
  })

  it('leaves primitives and arrays intact', () => {
    expect(sanitize('text')).toBe('text')
    expect(sanitize(7)).toBe(7)
    expect(sanitize(null)).toBeNull()
    expect(sanitize([1, { env: {} }])).toEqual([1, { env: REDACTED }])
  })

  it('produces meta that survives structuredClone', () => {
    const meta = sanitize({ error: new Error('x'), nested: { list: [1, 2] } })

    expect(() => structuredClone(meta)).not.toThrow()
  })
})

describe('FakeLogger', () => {
  it('captures entries so a test can assert a failure was reported', () => {
    const logger = createFakeLogger()

    logger.error('git command failed', { exitCode: 128 })
    logger.info('unrelated')

    expect(logger.entriesAt('error')).toEqual([
      { level: 'error', message: 'git command failed', meta: { exitCode: 128 } }
    ])
    expect(logger.entries).toHaveLength(2)
  })

  it('clears captured entries', () => {
    const logger = createFakeLogger()
    logger.info('one')

    logger.clear()

    expect(logger.entries).toHaveLength(0)
  })
})
