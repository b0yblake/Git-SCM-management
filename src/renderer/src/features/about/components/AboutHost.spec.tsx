import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP_LINKS } from '@shared/contracts/about'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useAboutStore } from '../store/aboutStore'
import { AboutHost } from './AboutHost'

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useAboutStore.getState().close()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

const dialog = () => screen.queryByRole('dialog', { name: 'About GitDeck' })

describe('opening', () => {
  it('shows nothing until something asks for it', () => {
    render(<AboutHost />)

    expect(dialog()).toBeNull()
  })

  it('opens on the native Help → About signal', () => {
    render(<AboutHost />)

    act(() => api.emitAboutOpen())

    expect(dialog()).not.toBeNull()
  })

  it('opens when the shell asks directly, as the version badge does', () => {
    render(<AboutHost />)

    act(() => useAboutStore.getState().open())

    expect(dialog()).not.toBeNull()
  })

  it('a second signal re-opens rather than stacking a second dialog', () => {
    render(<AboutHost />)

    act(() => api.emitAboutOpen())
    act(() => api.emitAboutOpen())

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})

describe('wiring', () => {
  it('asks Main to open a link by id, sending no URL', () => {
    render(<AboutHost />)
    act(() => api.emitAboutOpen())

    fireEvent.click(screen.getByRole('button', { name: APP_LINKS.repository.label }))

    expect(api.calls.aboutOpenLink).toEqual(['repository'])
  })

  it('closes on Escape and can be re-opened', () => {
    render(<AboutHost />)
    act(() => api.emitAboutOpen())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog()).toBeNull()

    act(() => api.emitAboutOpen())
    expect(dialog()).not.toBeNull()
  })
})

describe('lifecycle', () => {
  it('subscribes once and unsubscribes on unmount', () => {
    const { unmount } = render(<AboutHost />)

    expect(api.listenerCount()).toBe(1)

    unmount()

    expect(api.listenerCount()).toBe(0)
  })

  it('a signal after unmount opens nothing', () => {
    render(<AboutHost />).unmount()

    act(() => api.emitAboutOpen())

    expect(useAboutStore.getState().isOpen).toBe(false)
  })
})
