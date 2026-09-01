import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalShortcuts } from './useTerminalShortcuts'

const handlers = () => ({
  onCreate: vi.fn(),
  onCloseActive: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn()
})

let h: ReturnType<typeof handlers>

const press = (init: KeyboardEventInit): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

beforeEach(() => {
  h = handlers()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bindings', () => {
  beforeEach(() => {
    renderHook(() => useTerminalShortcuts(h))
  })

  it('Ctrl+T opens a terminal', () => {
    press({ key: 't', ctrlKey: true })

    expect(h.onCreate).toHaveBeenCalledOnce()
  })

  it('Ctrl+W closes the active terminal', () => {
    press({ key: 'w', ctrlKey: true })

    expect(h.onCloseActive).toHaveBeenCalledOnce()
  })

  it('Ctrl+Tab moves to the next terminal', () => {
    press({ key: 'Tab', ctrlKey: true })

    expect(h.onNext).toHaveBeenCalledOnce()
    expect(h.onPrevious).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+Tab moves to the previous terminal', () => {
    press({ key: 'Tab', ctrlKey: true, shiftKey: true })

    expect(h.onPrevious).toHaveBeenCalledOnce()
    expect(h.onNext).not.toHaveBeenCalled()
  })

  it('is case-insensitive so Caps Lock does not break it', () => {
    press({ key: 'T', ctrlKey: true })

    expect(h.onCreate).toHaveBeenCalledOnce()
  })
})

describe('keys it must ignore', () => {
  beforeEach(() => {
    renderHook(() => useTerminalShortcuts(h))
  })

  /** Reserved for the command palette; it must stay inert until scoped. */
  it('Ctrl+Shift+P does nothing', () => {
    press({ key: 'p', ctrlKey: true, shiftKey: true })
    press({ key: 'P', ctrlKey: true, shiftKey: true })

    expect(Object.values(h).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })

  it('plain T reaches the terminal instead of opening a tab', () => {
    press({ key: 't' })

    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+T is not the same as Ctrl+T', () => {
    press({ key: 't', ctrlKey: true, shiftKey: true })

    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('Ctrl+Alt+T is ignored', () => {
    press({ key: 't', ctrlKey: true, altKey: true })

    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('Ctrl+C is left alone — it is SIGINT in a terminal', () => {
    press({ key: 'c', ctrlKey: true })

    expect(Object.values(h).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })
})

describe('lifecycle', () => {
  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useTerminalShortcuts(h))

    unmount()
    press({ key: 't', ctrlKey: true })

    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('50 mount/unmount cycles leave no listener behind', () => {
    for (let i = 0; i < 50; i++) renderHook(() => useTerminalShortcuts(h)).unmount()

    press({ key: 't', ctrlKey: true })

    expect(h.onCreate).not.toHaveBeenCalled()
  })

  it('prevents the browser default so focus does not leave the terminal', () => {
    renderHook(() => useTerminalShortcuts(h))
    const event = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})
