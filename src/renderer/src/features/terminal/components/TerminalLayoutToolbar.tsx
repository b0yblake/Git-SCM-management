import type { TerminalLayoutMode } from '../store/terminalStore'

export interface TerminalLayoutToolbarProps {
  readonly mode: TerminalLayoutMode
  readonly visibleCount: number
  readonly onChange: (mode: TerminalLayoutMode) => void
}

const MODES: ReadonlyArray<{ id: TerminalLayoutMode; label: string }> = [
  { id: 'focus', label: 'Focus' },
  { id: 'columns', label: 'Columns' },
  { id: 'main-side', label: 'Main + Side' },
  { id: 'grid', label: 'Grid' }
]

const LayoutGlyph = ({ mode }: { readonly mode: TerminalLayoutMode }): React.JSX.Element => (
  <span className={`layout-glyph layout-glyph--${mode}`} aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
  </span>
)

export const TerminalLayoutToolbar = ({
  mode,
  visibleCount,
  onChange
}: TerminalLayoutToolbarProps): React.JSX.Element => (
  <header className="terminal-layout-toolbar">
    <div className="terminal-layout-toolbar__modes" aria-label="Terminal layout">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="terminal-layout-toolbar__mode"
          aria-pressed={mode === item.id}
          onClick={() => onChange(item.id)}
        >
          <LayoutGlyph mode={item.id} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
    <span className="terminal-layout-toolbar__count">{visibleCount} visible</span>
  </header>
)
