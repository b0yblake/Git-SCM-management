import { useEffect, useRef, useState } from 'react'
import type { AvailableShellProfile, ShellProfileId } from '@shared/contracts/terminal'

export interface NewTerminalMenuProps {
  /** Exactly what shell detection reported — the menu never filters or adds to it. */
  readonly profiles: readonly AvailableShellProfile[]
  readonly defaultShellProfileId: ShellProfileId | null
  /** Open with the default profile. */
  readonly onCreate: () => void
  readonly onCreateWithProfile: (id: ShellProfileId) => void
}

/**
 * The split "+" button: click to open the default shell, or use the arrow to
 * pick a specific one.
 *
 * Picking a profile also makes it the default, so the choice sticks without a
 * second interaction. Phase 10's settings screen adds explicit control.
 */
export const NewTerminalMenu = ({
  profiles,
  defaultShellProfileId,
  onCreate,
  onCreateWithProfile
}: NewTerminalMenuProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const closeOnOutside = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="new-terminal" ref={containerRef}>
      <button
        type="button"
        className="new-terminal__create"
        aria-label="New terminal"
        onClick={onCreate}
      >
        +
      </button>

      <button
        type="button"
        className="new-terminal__toggle"
        aria-label="Choose shell"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={profiles.length === 0}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        ⌄
      </button>

      {open && (
        <ul className="new-terminal__menu" role="menu" aria-label="Shells">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                role="menuitem"
                className="new-terminal__item"
                onClick={() => {
                  setOpen(false)
                  onCreateWithProfile(profile.id)
                }}
              >
                {profile.label}
                {profile.id === defaultShellProfileId && (
                  <span className="new-terminal__default"> (default)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
