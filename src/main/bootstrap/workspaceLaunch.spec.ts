import { describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { createWorkspaceLaunchService, type WorkspaceLaunchService } from './workspaceLaunch'

const WS = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const service = (
  existing: readonly string[] = [WS]
): { launch: WorkspaceLaunchService; logger: FakeLogger } => {
  const logger = createFakeLogger()
  return {
    logger,
    launch: createWorkspaceLaunchService({
      logger,
      workspaceExists: (id) => existing.includes(id)
    })
  }
}

describe('parsing', () => {
  it('accepts the = form and queues the id', () => {
    const { launch } = service()

    expect(launch.accept(['GitDeck.exe', `--open-workspace=${WS}`])).toBe(WS)
    expect(launch.takePending()).toBe(WS)
  })

  it('accepts the split form', () => {
    const { launch } = service()

    expect(launch.accept(['GitDeck.exe', '--open-workspace', WS])).toBe(WS)
  })

  it('an argv without the flag is a quiet no-op', () => {
    const { launch, logger } = service()

    expect(launch.accept(['GitDeck.exe'])).toBeNull()
    expect(logger.entriesAt('warn')).toEqual([])
  })
})

describe('validation', () => {
  it('drops a value that is not a workspace id', () => {
    const { launch, logger } = service()

    expect(launch.accept(['GitDeck.exe', '--open-workspace=not-an-id'])).toBeNull()
    expect(launch.takePending()).toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('drops a missing value', () => {
    const { launch, logger } = service()

    expect(launch.accept(['GitDeck.exe', '--open-workspace'])).toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('drops an id whose workspace no longer exists — the shortcut outlived it', () => {
    const { launch, logger } = service([])

    expect(launch.accept(['GitDeck.exe', `--open-workspace=${WS}`])).toBeNull()
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })
})

describe('the queue', () => {
  it('answers once, then null; a later accept overwrites', () => {
    const other = 'ws_11111111-2222-4333-8444-555555555555'
    const { launch } = service([WS, other])
    launch.accept(['GitDeck.exe', `--open-workspace=${WS}`])
    launch.accept(['GitDeck.exe', `--open-workspace=${other}`])

    expect(launch.takePending()).toBe(other)
    expect(launch.takePending()).toBeNull()
  })
})
