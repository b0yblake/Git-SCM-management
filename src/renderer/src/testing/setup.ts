import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom is missing two browser APIs that xterm.js and `TerminalView` need.
 * Both are stubbed rather than faked away, so tests still drive real xterm.
 */

// Testing Library only self-registers cleanup when vitest runs with globals
// enabled; it does not here, so a previous test's DOM would leak into the next.
afterEach(() => {
  cleanup()
})

// xterm reads this on open() to track device pixel ratio.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false
})) as unknown as typeof window.matchMedia

type Callback = ResizeObserverCallback

/** A ResizeObserver a test can fire on demand — jsdom never resizes anything. */
class TestResizeObserver implements ResizeObserver {
  static readonly instances = new Set<TestResizeObserver>()

  readonly targets = new Set<Element>()

  constructor(private readonly callback: Callback) {
    TestResizeObserver.instances.add(this)
  }

  observe(target: Element): void {
    this.targets.add(target)
  }

  unobserve(target: Element): void {
    this.targets.delete(target)
  }

  disconnect(): void {
    this.targets.clear()
    TestResizeObserver.instances.delete(this)
  }

  fire(): void {
    this.callback([], this)
  }
}

globalThis.ResizeObserver = TestResizeObserver

/** Fires every live ResizeObserver, as a real browser would after a layout change. */
export const triggerResize = (): void => {
  for (const observer of [...TestResizeObserver.instances]) observer.fire()
}

/**
 * How many observers are still watching `element`.
 *
 * Scoped to an element on purpose: xterm.js creates ResizeObservers of its own,
 * so a global count would never reach zero and could not detect a leak.
 */
export const observersWatching = (element: Element): number =>
  [...TestResizeObserver.instances].filter((observer) => observer.targets.has(element)).length
