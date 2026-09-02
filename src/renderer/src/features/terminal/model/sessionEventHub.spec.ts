import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { onSessionData, onSessionExit } from './sessionEventHub'

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  api.uninstall()
})

describe('routing', () => {
  it('delivers data only to the session it belongs to', () => {
    const a: string[] = []
    const b: string[] = []
    const offA = onSessionData('sess_a', (data) => a.push(data))
    const offB = onSessionData('sess_b', (data) => b.push(data))

    api.emitData({ sessionId: 'sess_a', data: 'for a' })
    api.emitData({ sessionId: 'sess_b', data: 'for b' })
    api.emitData({ sessionId: 'sess_unknown', data: 'dropped' })

    expect(a).toEqual(['for a'])
    expect(b).toEqual(['for b'])
    offA()
    offB()
  })

  it('delivers an exit only to its session', () => {
    const exits: number[] = []
    const off = onSessionExit('sess_a', (code) => exits.push(code))

    api.emitExit({ sessionId: 'sess_b', exitCode: 1 })
    api.emitExit({ sessionId: 'sess_a', exitCode: 0 })

    expect(exits).toEqual([0])
    off()
  })

  it('supports several subscribers on one session', () => {
    const seen: string[] = []
    const off1 = onSessionData('sess_a', () => seen.push('first'))
    const off2 = onSessionData('sess_a', () => seen.push('second'))

    api.emitData({ sessionId: 'sess_a', data: 'x' })

    expect(seen).toEqual(['first', 'second'])
    off1()
    off2()
  })
})

describe('the point of the hub — bridge listeners stay flat', () => {
  it('ten sessions still hold exactly two bridge subscriptions', () => {
    const offs = Array.from({ length: 10 }, (_, i) => [
      onSessionData(`sess_${i}`, () => {}),
      onSessionExit(`sess_${i}`, () => {})
    ]).flat()

    // One data root + one exit root — not twenty.
    expect(api.listenerCount()).toBe(2)

    for (const off of offs) off()
  })

  it('releases the bridge subscriptions when the last consumer leaves', () => {
    const offData = onSessionData('sess_a', () => {})
    const offExit = onSessionExit('sess_a', () => {})
    expect(api.listenerCount()).toBe(2)

    offData()
    offExit()

    expect(api.listenerCount()).toBe(0)
  })

  it('resubscribes cleanly after a full release', () => {
    onSessionData('sess_a', () => {})()
    const seen: string[] = []
    const off = onSessionData('sess_b', (data) => seen.push(data))

    api.emitData({ sessionId: 'sess_b', data: 'alive' })

    expect(seen).toEqual(['alive'])
    off()
    expect(api.listenerCount()).toBe(0)
  })

  it('unsubscribing twice is harmless', () => {
    const off = onSessionData('sess_a', () => {})

    off()

    expect(() => off()).not.toThrow()
    expect(api.listenerCount()).toBe(0)
  })
})
