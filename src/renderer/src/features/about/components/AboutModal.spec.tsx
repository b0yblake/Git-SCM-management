import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_LINKS, APP_LINK_IDS } from '@shared/contracts/about'
import {
  createFakeGitDeckApi,
  emptyCalls,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { AboutModal } from './AboutModal'

let api: FakeGitDeckApi
const onOpenLink = vi.fn()
const onClose = vi.fn()

const show = (version = '9.9.9') =>
  render(<AboutModal version={version} onOpenLink={onOpenLink} onClose={onClose} />)

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  onOpenLink.mockClear()
  onClose.mockClear()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('what it says about the product', () => {
  it('names the app, its tagline and the version it was built as', () => {
    // A version the app will never really be: the dialog must render what it
    // is handed, so a literal that happens to match the current release would
    // pass even if the prop were ignored.
    show('12.34.56')

    const dialog = screen.getByRole('dialog', { name: 'About GitDeck' })
    expect(dialog.textContent).toContain('GitDeck')
    expect(dialog.textContent).toContain('See every shell. Lose none.')
    expect(dialog.textContent).toContain('12.34.56')
  })

  it('carries the README facts a user opens About for', () => {
    const text = show().container.textContent ?? ''

    expect(text).toContain('Windows 10/11 x64')
    expect(text).toContain('UNLICENSED')
    // The privacy promise, in the same words the README makes it.
    expect(text).toContain('no account, cloud sync, analytics, or telemetry')
  })
})

describe('project links', () => {
  it('offers every link in the shared table, and shows where each one goes', () => {
    show()

    for (const id of APP_LINK_IDS) {
      expect(screen.getByRole('button', { name: APP_LINKS[id].label })).toBeDefined()
      expect(screen.getByText(APP_LINKS[id].url)).toBeDefined()
    }
  })

  it('reports the link by id — the URL beside it is shown, never sent', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: APP_LINKS.releases.label }))

    expect(onOpenLink).toHaveBeenCalledExactlyOnceWith('releases')
  })
})

describe('dismissing', () => {
  it('closes on the close button', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Close about' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is pressed', () => {
    const { container } = show()

    fireEvent.mouseDown(container.querySelector('.dialog-backdrop')!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a press inside the dialog does not close it', () => {
    show()

    fireEvent.mouseDown(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape, so it is escapable without a mouse', () => {
    show()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stops listening for Escape once unmounted', () => {
    show().unmount()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('keyboard', () => {
  it('focus lands inside the dialog when it opens', () => {
    show()

    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close about')
  })

  it('returns focus where it was when it closes', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()

    show().unmount()

    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

/** Presentational: every fact is a prop or a constant, no channel is touched. */
describe('boundary', () => {
  it('renders and is driven without touching the bridge', () => {
    show()

    for (const id of APP_LINK_IDS) {
      fireEvent.click(screen.getByRole('button', { name: APP_LINKS[id].label }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Close about' }))

    expect(api.calls).toEqual(emptyCalls())
  })
})
