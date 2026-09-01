import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DISMISS_MS, useToastStore } from '../store/toastStore'
import { ToastHost } from './Toast'

const messages = (): string[] =>
  screen.queryAllByRole('listitem').map((item) => item.textContent?.replace('×', '').trim() ?? '')

const push = (message: string): void => {
  act(() => {
    useToastStore.getState().push('error', message)
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  useToastStore.getState().clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('surfacing an error', () => {
  it('renders the message a feature pushed', () => {
    render(<ToastHost />)

    push('Shell profile "fish" is not available')

    expect(messages()).toEqual(['Shell profile "fish" is not available'])
  })

  /** Two features failing at once is when the user most needs both messages. */
  it('stacks simultaneous errors rather than replacing them', () => {
    render(<ToastHost />)

    push('first')
    push('second')
    push('third')

    expect(messages()).toEqual(['first', 'second', 'third'])
  })

  it('renders nothing at all when there is nothing to say', () => {
    const { container } = render(<ToastHost />)

    expect(container.textContent).toBe('')
    expect(screen.queryByRole('log')).toBeNull()
  })
})

describe('dismissing', () => {
  it('goes away on its own after the documented interval', () => {
    render(<ToastHost />)
    push('temporary')

    act(() => {
      vi.advanceTimersByTime(TOAST_DISMISS_MS)
    })

    expect(messages()).toEqual([])
  })

  it('is still there just before that interval', () => {
    render(<ToastHost />)
    push('temporary')

    act(() => {
      vi.advanceTimersByTime(TOAST_DISMISS_MS - 100)
    })

    expect(messages()).toEqual(['temporary'])
  })

  it('can be dismissed by hand', () => {
    render(<ToastHost />)
    push('in the way')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: in the way' }))

    expect(messages()).toEqual([])
  })

  it('dismissing one leaves the others', () => {
    render(<ToastHost />)
    push('first')
    push('second')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: first' }))

    expect(messages()).toEqual(['second'])
  })

  /** Each toast owns its own timer, so a later one is not cut short. */
  it('a later toast keeps its full lifetime', () => {
    render(<ToastHost />)
    push('early')

    act(() => {
      vi.advanceTimersByTime(TOAST_DISMISS_MS - 1_000)
    })
    push('late')
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(messages()).toEqual(['late'])
  })
})

describe('accessibility', () => {
  /**
   * `log`, not `alert`: several may arrive together, and a screen reader
   * interrupting itself once per message is worse than reading them in order.
   */
  it('announces politely, as a log', () => {
    render(<ToastHost />)
    push('something happened')

    const host = screen.getByRole('log', { name: 'Notifications' })
    expect(host.getAttribute('aria-live')).toBe('polite')
  })

  it('every dismiss control names the message it dismisses', () => {
    render(<ToastHost />)
    push('disk is on fire')

    expect(screen.getByRole('button', { name: 'Dismiss: disk is on fire' })).toBeDefined()
  })
})
