import { useEffect, useRef } from 'react'
import { APP_LINKS, APP_LINK_IDS, type AppLinkId } from '@shared/contracts/about'

/**
 * What the dialog says about the product, in the README's own words. Kept here
 * so the two never drift into describing different applications; the version
 * is not here because it comes from `package.json` at build time.
 */
const ABOUT = {
  name: 'GitDeck',
  tagline: 'See every shell. Lose none.',
  description:
    'A local-first terminal workspace manager for Windows developers who run several shells at once — dev server, build watcher, git, logs — and are tired of hunting for them in a crowded tab bar.',
  platform: 'Windows 10/11 x64',
  privacy:
    'Local-first: no account, cloud sync, analytics, or telemetry. Terminal input and output are never logged. At startup, at most once a day, GitDeck makes one anonymous request to the GitHub Releases API to see whether a newer version exists; it can be turned off in Settings.',
  license:
    'UNLICENSED. Public source visibility does not grant permission to redistribute or sublicense the project.'
} as const

export interface AboutModalProps {
  /** From `package.json` at build time, so it can never disagree with the binary. */
  readonly version: string
  readonly onOpenLink: (link: AppLinkId) => void
  readonly onClose: () => void
}

/**
 * About GitDeck.
 *
 * Purely presentational: every fact is a constant or a prop, and it never
 * touches `window.gitdeck`. A link click reports the link's **id** — the URL
 * beside it is shown, never sent.
 */
export const AboutModal = ({
  version,
  onOpenLink,
  onClose
}: AboutModalProps): React.JSX.Element => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus moves in on open and back out on close, so the dialog is reachable
  // and leavable without a mouse.
  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  // On the window, not the dialog: after a button that had focus disappears,
  // focus falls back to body — and Escape must still work.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('keydown', onEscape)
    }
  }, [onClose])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Tab') return

    // Minimal focus trap, matching the ports modal: Tab wraps inside the
    // dialog instead of escaping to the terminals behind the backdrop.
    const focusables = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
    ]
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="dialog about-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`About ${ABOUT.name}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="about-modal__header">
          <div>
            <h2 className="about-modal__title">{ABOUT.name}</h2>
            <p className="about-modal__tagline">{ABOUT.tagline}</p>
          </div>
          <button type="button" ref={closeRef} aria-label="Close about" onClick={onClose}>
            ×
          </button>
        </header>

        <p className="about-modal__description">{ABOUT.description}</p>

        <dl className="about-modal__facts">
          <dt>Version</dt>
          <dd>{version}</dd>
          <dt>Platform</dt>
          <dd>{ABOUT.platform}</dd>
          <dt>License</dt>
          <dd>{ABOUT.license}</dd>
        </dl>

        <h3 className="about-modal__heading">Privacy</h3>
        <p className="about-modal__note">{ABOUT.privacy}</p>

        <h3 className="about-modal__heading">Project</h3>
        <ul className="about-modal__links">
          {APP_LINK_IDS.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => onOpenLink(id)}>
                {APP_LINKS[id].label}
              </button>
              <span className="about-modal__url">{APP_LINKS[id].url}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
