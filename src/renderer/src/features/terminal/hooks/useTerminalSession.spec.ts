import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_TERMINAL_DIMENSION } from '@shared/contracts/ipc'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalSession } from './useTerminalSession'

let api: FakeGitDeckApi

const mount = (sessionId = 'sess_1', onOutput: (data: string) => void = () => {}) =>
  renderHook(({ id }) => useTerminalSession({ sessionId: id, onOutput }), {
    initialProps: { id: sessionId }
  })

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  api.uninstall()
})

describe('subscriptions', () => {
  it('subscribes to onData and onExit exactly once on mount', () => {
    mount()

    expect(api.listenerCount()).toBe(2)
  })

  it('delivers output for its own session', () => {
    const received: string[] = []
    mount('sess_1', (data) => received.push(data))

    act(() => api.emitData({ sessionId: 'sess_1', data: 'hello' }))

    expect(received).toEqual(['hello'])
  })

  it('ignores output addressed to another session', () => {
    const received: string[] = []
    mount('sess_1', (data) => received.push(data))

    act(() => api.emitData({ sessionId: 'sess_2', data: 'not mine' }))

    expect(received).toEqual([])
  })

  it('does not re-subscribe when only the onOutput identity changes', () => {
    const { rerender } = renderHook(
      ({ cb }) => useTerminalSession({ sessionId: 'sess_1', onOutput: cb }),
      { initialProps: { cb: () => {} } }
    )

    rerender({ cb: () => {} })
    rerender({ cb: () => {} })

    expect(api.listenerCount()).toBe(2)
  })

  it('unsubscribes both listeners on unmount', () => {
    const { unmount } = mount()

    unmount()

    expect(api.listenerCount()).toBe(0)
  })

  it('re-subscribes cleanly when the sessionId changes', () => {
    const received: string[] = []
    const { rerender } = renderHook(
      ({ id }) => useTerminalSession({ sessionId: id, onOutput: (d) => received.push(d) }),
      { initialProps: { id: 'sess_1' } }
    )

    rerender({ id: 'sess_2' })
    act(() => api.emitData({ sessionId: 'sess_1', data: 'old' }))
    act(() => api.emitData({ sessionId: 'sess_2', data: 'new' }))

    expect(api.listenerCount()).toBe(2)
    expect(received).toEqual(['new'])
  })

  it('50 mount/unmount cycles leave zero subscriptions', () => {
    for (let i = 0; i < 50; i++) {
      const { unmount } = mount()
      unmount()
    }

    expect(api.listenerCount()).toBe(0)
  })
})

describe('input forwarding', () => {
  it('writes to the matching session', () => {
    const { result } = mount('sess_1')

    act(() => result.current.sendInput('ls\r'))

    expect(api.calls.write).toEqual([{ sessionId: 'sess_1', data: 'ls\r' }])
  })

  it('exposes a stable sendInput across renders', () => {
    const { result, rerender } = mount()
    const first = result.current.sendInput

    rerender({ id: 'sess_1' })

    expect(result.current.sendInput).toBe(first)
  })

  it('never kills the session', () => {
    const { result, unmount } = mount()

    act(() => result.current.sendInput('x'))
    unmount()

    expect(api.calls.kill).toEqual([])
  })
})

describe('resize hygiene', () => {
  it('forwards a valid resize', () => {
    const { result } = mount('sess_1')

    act(() => result.current.sendResize(100, 30))

    expect(api.calls.resize).toEqual([{ sessionId: 'sess_1', cols: 100, rows: 30 }])
  })

  it.each([
    ['zero', 0, 24],
    ['negative', -1, 24],
    ['NaN', Number.NaN, 24],
    ['fractional', 80.5, 24],
    ['Infinity', Number.POSITIVE_INFINITY, 24],
    ['above the bound', MAX_TERMINAL_DIMENSION + 1, 24],
    ['bad rows', 80, 0]
  ])('drops a %s dimension', (_label, cols, rows) => {
    const { result } = mount()

    act(() => result.current.sendResize(cols, rows))

    expect(api.calls.resize).toEqual([])
  })

  it('sends only when the cell dimensions actually change', () => {
    const { result } = mount()

    act(() => {
      result.current.sendResize(80, 24)
      result.current.sendResize(80, 24)
      result.current.sendResize(80, 24)
      result.current.sendResize(81, 24)
      result.current.sendResize(81, 24)
    })

    expect(api.calls.resize.map((call) => call.cols)).toEqual([80, 81])
  })
})

describe('exit', () => {
  it('reports the exited status and code', () => {
    const { result } = mount('sess_1')

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 3 }))

    expect(result.current.status).toBe('exited')
    expect(result.current.exitCode).toBe(3)
  })

  it('ignores an exit for another session', () => {
    const { result } = mount('sess_1')

    act(() => api.emitExit({ sessionId: 'sess_2', exitCode: 1 }))

    expect(result.current.status).toBe('running')
  })

  it('stops forwarding input once exited', () => {
    const { result } = mount('sess_1')

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 0 }))
    act(() => result.current.sendInput('ignored'))

    expect(api.calls.write).toEqual([])
  })

  it('stops forwarding resize once exited', () => {
    const { result } = mount('sess_1')

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 0 }))
    act(() => result.current.sendResize(100, 30))

    expect(api.calls.resize).toEqual([])
  })

  it('output arriving after unmount reaches nobody and does not throw', () => {
    const onOutput = vi.fn()
    const { unmount } = mount('sess_1', onOutput)

    unmount()

    expect(() => api.emitData({ sessionId: 'sess_1', data: 'late' })).not.toThrow()
    expect(onOutput).not.toHaveBeenCalled()
  })
})
