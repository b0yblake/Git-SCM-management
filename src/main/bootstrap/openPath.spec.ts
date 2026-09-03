import { describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { createOpenPathService, type OpenPathService } from './openPath'

const DIR = 'C:\\work\\api'

const service = (
  directories: readonly string[] = [DIR]
): { openPath: OpenPathService; logger: FakeLogger } => {
  const logger = createFakeLogger()
  return {
    logger,
    openPath: createOpenPathService({
      logger,
      isDirectory: (path) => directories.includes(path)
    })
  }
}

describe('parsing', () => {
  it('accepts the split form and queues the directory', () => {
    const { openPath } = service()

    expect(openPath.accept(['GitDeck.exe', '--open-path', DIR])).toBe(DIR)
    expect(openPath.takePending()).toBe(DIR)
  })

  it('accepts the = form', () => {
    const { openPath } = service()

    expect(openPath.accept(['GitDeck.exe', `--open-path=${DIR}`])).toBe(DIR)
  })

  it('an argv without the flag is a quiet no-op', () => {
    const { openPath, logger } = service()

    expect(openPath.accept(['GitDeck.exe'])).toBeNull()
    expect(openPath.takePending()).toBeNull()
    expect(logger.entriesAt('warn')).toEqual([])
  })
})

describe('validation — anything doubtful is dropped, never guessed', () => {
  it('drops a flag with no value', () => {
    const { openPath, logger } = service()

    expect(openPath.accept(['GitDeck.exe', '--open-path'])).toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('drops a relative path', () => {
    const { openPath } = service()

    expect(openPath.accept(['GitDeck.exe', '--open-path', 'work\\api'])).toBeNull()
  })

  it('drops a path that is not an existing directory', () => {
    const { openPath, logger } = service([])

    expect(openPath.accept(['GitDeck.exe', '--open-path', DIR])).toBeNull()
    expect(openPath.takePending()).toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })
})

describe('the queue', () => {
  it('answers once, then null', () => {
    const { openPath } = service()
    openPath.accept(['GitDeck.exe', '--open-path', DIR])

    expect(openPath.takePending()).toBe(DIR)
    expect(openPath.takePending()).toBeNull()
  })

  it('a later accept overwrites an unclaimed path', () => {
    const other = 'C:\\work\\web'
    const { openPath } = service([DIR, other])
    openPath.accept(['GitDeck.exe', '--open-path', DIR])

    openPath.accept(['GitDeck.exe', '--open-path', other])

    expect(openPath.takePending()).toBe(other)
    expect(openPath.takePending()).toBeNull()
  })
})
