import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { createFakeReleaseClient, type FakeReleaseClient } from '../testing/FakeReleaseClient'
import { AUTO_CHECK_INTERVAL_MS, UpdateService } from './UpdateService'

let client: FakeReleaseClient
let logger: FakeLogger
let checkEnabled: boolean
let skipped: string | null
let lastCheckAt: number | null
let recorded: number[]
let clock: number

const service = (): UpdateService =>
  new UpdateService({
    client,
    currentVersion: '0.1.0',
    getSettings: () => ({ checkForUpdatesOnStartup: checkEnabled, skippedUpdateVersion: skipped }),
    readLastCheckAt: () => lastCheckAt,
    recordCheckAt: (at) => {
      recorded.push(at)
      lastCheckAt = at
    },
    logger,
    now: () => clock
  })

beforeEach(() => {
  client = createFakeReleaseClient()
  logger = createFakeLogger()
  checkEnabled = true
  skipped = null
  lastCheckAt = null
  recorded = []
  clock = 1_000_000
})

describe('gating and throttling — zero requests when quiet', () => {
  it('disabled → null and no client call', async () => {
    checkEnabled = false

    expect(await service().checkOnStartup()).toBeNull()
    expect(client.fetchCount).toBe(0)
    expect(recorded).toEqual([])
  })

  it('a check within 24h → null and no client call', async () => {
    lastCheckAt = clock - AUTO_CHECK_INTERVAL_MS + 1

    expect(await service().checkOnStartup()).toBeNull()
    expect(client.fetchCount).toBe(0)
  })

  it('a check older than 24h runs again and records the attempt', async () => {
    lastCheckAt = clock - AUTO_CHECK_INTERVAL_MS - 1

    await service().checkOnStartup()

    expect(client.fetchCount).toBe(1)
    expect(recorded).toEqual([clock])
  })

  it('the manual check ignores the gate and the throttle', async () => {
    checkEnabled = false
    lastCheckAt = clock

    await service().checkNow()

    expect(client.fetchCount).toBe(1)
    expect(recorded).toEqual([clock])
  })
})

describe('comparison outcomes', () => {
  it('a newer release is update-available with a minted URL', async () => {
    client.respondWith({ tagName: 'v0.2.0', publishedAt: 42 })

    const result = await service().checkOnStartup()

    expect(result).toEqual({
      status: 'update-available',
      currentVersion: '0.1.0',
      latest: {
        version: '0.2.0',
        releaseUrl: 'https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.2.0',
        publishedAt: 42
      }
    })
  })

  it('the same version is up-to-date', async () => {
    client.respondWith({ tagName: 'v0.1.0' })

    expect((await service().checkOnStartup())?.status).toBe('up-to-date')
  })

  it('an older release is up-to-date, never a downgrade prompt', async () => {
    client.respondWith({ tagName: 'v0.0.9' })

    expect((await service().checkOnStartup())?.status).toBe('up-to-date')
  })

  it('a draft or prerelease flagged response never prompts', async () => {
    client.respondWith({ tagName: 'v0.2.0', prerelease: true })
    expect((await service().checkOnStartup())?.status).toBe('up-to-date')

    lastCheckAt = null
    client.respondWith({ tagName: 'v0.2.0', prerelease: false, draft: true })
    expect((await service().checkOnStartup())?.status).toBe('up-to-date')
  })

  it('an unreadable tag is check-failed, quietly', async () => {
    client.respondWith({ tagName: 'v0.2.0-rc.1' })

    const result = await service().checkOnStartup()

    expect(result?.status).toBe('check-failed')
    expect(logger.entriesAt('warn')).toEqual([])
  })

  it('a network failure is check-failed with only a debug log', async () => {
    client.fail('offline')

    const result = await service().checkOnStartup()

    expect(result?.status).toBe('check-failed')
    expect(result?.latest).toBeNull()
    expect(logger.entriesAt('warn')).toEqual([])
    expect(logger.entriesAt('error')).toEqual([])
  })
})

describe('skip', () => {
  it('the skipped version comes back up-to-date on the startup path', async () => {
    skipped = '0.2.0'
    client.respondWith({ tagName: 'v0.2.0' })

    expect((await service().checkOnStartup())?.status).toBe('up-to-date')
  })

  it('a release newer than the skipped one prompts again', async () => {
    skipped = '0.2.0'
    client.respondWith({ tagName: 'v0.3.0' })

    expect((await service().checkOnStartup())?.status).toBe('update-available')
  })

  it('the manual check reports a skipped version anyway — the user asked', async () => {
    skipped = '0.2.0'
    client.respondWith({ tagName: 'v0.2.0' })

    expect((await service().checkNow()).status).toBe('update-available')
  })
})

describe('getLatest — the only URL openRelease may open', () => {
  it('is null before any successful check finds an update', async () => {
    const instance = service()

    expect(instance.getLatest()).toBeNull()
    client.respondWith({ tagName: 'v0.1.0' })
    await instance.checkNow()
    expect(instance.getLatest()).toBeNull()
  })

  it('holds the minted release after a hit', async () => {
    const instance = service()
    client.respondWith({ tagName: 'v0.2.0' })

    await instance.checkNow()

    expect(instance.getLatest()?.releaseUrl).toBe(
      'https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.2.0'
    )
  })
})
