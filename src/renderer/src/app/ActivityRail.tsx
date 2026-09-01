export type AppSection = 'terminals' | 'workspaces' | 'settings'

export interface ActivityRailProps {
  readonly activeSection: AppSection
  readonly onSelect: (section: AppSection) => void
}

const RailIcon = ({ kind }: { readonly kind: AppSection }): React.JSX.Element => {
  if (kind === 'terminals') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m7 9 3 3-3 3M12 15h5" />
      </svg>
    )
  }

  if (kind === 'workspaces') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.4 3.1a8 8 0 0 0-1.8 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1a8 8 0 0 0 1.8 1l.4 3h4.8l.4-3a8 8 0 0 0 1.8-1l2.4 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1Z" />
    </svg>
  )
}

const ITEMS: ReadonlyArray<{ id: AppSection; label: string }> = [
  { id: 'terminals', label: 'Terminals' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'settings', label: 'Settings' }
]

export const ActivityRail = ({ activeSection, onSelect }: ActivityRailProps): React.JSX.Element => (
  <nav className="activity-rail" aria-label="Primary">
    <div className="activity-rail__brand" aria-label="GitDeck">
      GD
    </div>
    <div className="activity-rail__items">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="activity-rail__button"
          aria-label={item.label}
          aria-current={activeSection === item.id ? 'page' : undefined}
          title={item.label}
          onClick={() => onSelect(item.id)}
        >
          <RailIcon kind={item.id} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  </nav>
)
