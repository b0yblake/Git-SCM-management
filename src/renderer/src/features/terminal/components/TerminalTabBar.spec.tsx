import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import {
  createFakeGitDeckApi,
  emptyCalls,
  FAKE_PROFILES,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { TerminalTabBar, type TerminalTabBarProps } from './TerminalTabBar'

/**
 * Renaming is controlled by the bar's parent from Phase 10, so the context menu
 * can start one. This holds that single piece of state, leaving every
 * assertion below unchanged and exercising the controlled contract.
 */
const Bar = (
  props: Omit<TerminalTabBarProps, 'renamingId' | 'onRenamingChange'>
): React.JSX.Element => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  return <TerminalTabBar {...props} renamingId={renamingId} onRenamingChange={setRenamingId} />
}

const session = (id: string, title: string, status: 'running' | 'exited' = 'running') =>
  ({
    id,
    definition: { id: `term_${id}`, title, cwd: 'C:/work', shellProfileId: 'powershell' },
    status,
    createdAt: 0
  }) satisfies TerminalSessionInfo

let api: FakeGitDeckApi

const handlers = () => ({
  onActivate: vi.fn(),
  onClose: vi.fn(),
  onRename: vi.fn(),
  onCreate: vi.fn(),
  onCreateWithProfile: vi.fn(),
  profiles: FAKE_PROFILES,
  defaultShellProfileId: 'powershell' as const
})

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('rendering', () => {
  it('renders one tab per session, in the given order', () => {
    render(
      <Bar
        terminals={[session('a', 'Backend'), session('b', 'Frontend')]}
        activeId="a"
        {...handlers()}
      />
    )

    expect(
      screen.getAllByRole('button', { name: /^(Backend|Frontend)$/ }).map((b) => b.textContent)
    ).toEqual(['Backend', 'Frontend'])
  })

  it('marks the active tab', () => {
    render(<Bar terminals={[session('a', 'A'), session('b', 'B')]} activeId="b" {...handlers()} />)

    expect(screen.getByRole('button', { name: 'B' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'A' }).getAttribute('aria-current')).toBe('false')
  })

  it('shows an exited session as exited without removing it', () => {
    render(<Bar terminals={[session('a', 'A', 'exited')]} activeId="a" {...handlers()} />)

    expect(screen.getByRole('button', { name: 'A (exited)' }).textContent).toContain('exited')
  })

  it('renders an empty bar with no sessions', () => {
    render(<Bar terminals={[]} activeId={null} {...handlers()} />)

    expect(screen.getByRole('button', { name: 'New terminal' })).toBeDefined()
  })
})

describe('intents', () => {
  it('clicking a tab reports activate with its id', () => {
    const h = handlers()
    render(<Bar terminals={[session('a', 'A'), session('b', 'B')]} activeId="a" {...h} />)

    fireEvent.click(screen.getByRole('button', { name: 'B' }))

    expect(h.onActivate).toHaveBeenCalledWith('b')
  })

  it('clicking close reports close with its id', () => {
    const h = handlers()
    render(<Bar terminals={[session('a', 'A')]} activeId="a" {...h} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close A' }))

    expect(h.onClose).toHaveBeenCalledWith('a')
  })

  it('clicking new reports create', () => {
    const h = handlers()
    render(<Bar terminals={[]} activeId={null} {...h} />)

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

    expect(h.onCreate).toHaveBeenCalledOnce()
  })

  it('double-clicking a label starts a rename and Enter commits it', () => {
    const h = handlers()
    render(<Bar terminals={[session('a', 'A')]} activeId="a" {...h} />)

    fireEvent.doubleClick(screen.getByRole('button', { name: 'A' }))
    const input = screen.getByLabelText('Rename A')
    fireEvent.change(input, { target: { value: 'Backend' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(h.onRename).toHaveBeenCalledWith('a', 'Backend')
  })

  it('Escape abandons a rename', () => {
    const h = handlers()
    render(<Bar terminals={[session('a', 'A')]} activeId="a" {...h} />)

    fireEvent.doubleClick(screen.getByRole('button', { name: 'A' }))
    fireEvent.change(screen.getByLabelText('Rename A'), { target: { value: 'Nope' } })
    fireEvent.keyDown(screen.getByLabelText('Rename A'), { key: 'Escape' })

    expect(h.onRename).not.toHaveBeenCalled()
  })

  it('a blank rename is discarded', () => {
    const h = handlers()
    render(<Bar terminals={[session('a', 'A')]} activeId="a" {...h} />)

    fireEvent.doubleClick(screen.getByRole('button', { name: 'A' }))
    fireEvent.change(screen.getByLabelText('Rename A'), { target: { value: '   ' } })
    fireEvent.blur(screen.getByLabelText('Rename A'))

    expect(h.onRename).not.toHaveBeenCalled()
  })
})

/** PLAN.md §16: the tab bar must not call IPC directly. */
describe('boundary', () => {
  it('drives the whole component without touching the bridge', () => {
    const h = handlers()
    render(<Bar terminals={[session('a', 'A'), session('b', 'B')]} activeId="a" {...h} />)

    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close A' }))
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'B' }))

    expect(api.calls).toEqual(emptyCalls())
    expect(api.listenerCount()).toBe(0)
  })
})
