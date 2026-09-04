import { beforeEach, describe, expect, it } from 'vitest'
import { APP_LINKS, APP_LINK_IDS, isAppLinkId } from '@shared/contracts/about'
import { IPC, IPC_ERROR_CODES } from '@shared/contracts/ipc'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { registerAboutIpc } from './aboutIpc'

type Handler = (payload: unknown) => unknown

let handlers: Map<string, Handler>
let opened: string[]
let logger: FakeLogger

const registry = {
  handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
  on: () => {}
}

beforeEach(() => {
  handlers = new Map()
  opened = []
  logger = createFakeLogger()
  registerAboutIpc({
    registry,
    openExternal: (url) => {
      opened.push(url)
      return Promise.resolve()
    },
    logger
  })
})

const openLink = (payload: unknown): { ok: boolean; error?: { code: string } } =>
  handlers.get(IPC.about.link)!(payload) as { ok: boolean; error?: { code: string } }

describe('registration', () => {
  it('registers only the link channel — the open signal is Main → renderer', () => {
    expect([...handlers.keys()]).toEqual([IPC.about.link])
  })
})

describe('opening a project link', () => {
  it('opens every known link at the URL the shared table names', () => {
    for (const id of APP_LINK_IDS) {
      expect(openLink({ link: id }).ok).toBe(true)
    }

    expect(opened).toEqual(APP_LINK_IDS.map((id) => APP_LINKS[id].url))
  })

  it('opens https URLs on the project repository, and nothing else', () => {
    for (const url of Object.values(APP_LINKS).map((link) => link.url)) {
      expect(url.startsWith('https://github.com/b0yblake/Git-SCM-management')).toBe(true)
    }
  })
})

/**
 * The point of the key-not-URL design: whatever the renderer sends, the only
 * thing that can reach the browser is one of three constants.
 */
describe('a payload can never become a URL', () => {
  const rejected = [
    { link: 'https://evil.example/steal' },
    { link: 'file:///C:/Windows/System32/calc.exe' },
    { link: 'constructor' },
    { link: '__proto__' },
    { link: 'toString' },
    { link: 'repository', extra: 'https://evil.example' },
    { url: 'https://evil.example' },
    { link: 1 },
    { link: null },
    {},
    'repository',
    undefined,
    null,
    []
  ]

  it('rejects anything that is not exactly { link: <known id> }', () => {
    for (const payload of rejected) {
      const result = openLink(payload)
      expect(result.ok, JSON.stringify(payload)).toBe(false)
      expect(result.error?.code).toBe(IPC_ERROR_CODES.invalidRequest)
    }

    expect(opened).toEqual([])
  })

  it('does not accept a key inherited from the prototype chain', () => {
    // `'constructor' in APP_LINKS` is true; `Object.hasOwn` is why the guard
    // above holds.
    expect('constructor' in APP_LINKS).toBe(true)
    expect(isAppLinkId('constructor')).toBe(false)
  })
})

describe('failure handling', () => {
  it('a browser that will not open is logged, never thrown at the renderer', async () => {
    handlers.clear()
    registerAboutIpc({
      registry,
      openExternal: () => Promise.reject(new Error('no browser')),
      logger
    })

    expect(openLink({ link: 'repository' }).ok).toBe(true)
    await Promise.resolve()

    expect(logger.entriesAt('warn')).toHaveLength(1)
  })
})
