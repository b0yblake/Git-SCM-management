import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSummary } from '@shared/contracts/workspace'
import {
  createFakeGitDeckApi,
  emptyCalls,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { WorkspaceSidebar } from './WorkspaceSidebar'

let api: FakeGitDeckApi

const summary = (id: string, name: string, terminalCount = 2): WorkspaceSummary => ({
  id,
  name,
  terminalCount,
  createdAt: 1,
  updatedAt: 2
})

const handlers = () => ({
  onOpen: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onCreate: vi.fn()
})

const show = (
  props: Partial<React.ComponentProps<typeof WorkspaceSidebar>> = {},
  h = handlers()
) => {
  render(
    <WorkspaceSidebar
      workspaces={[summary('ws_a', 'My SaaS'), summary('ws_b', 'Docs', 1)]}
      activeWorkspaceId={null}
      notices={[]}
      isLoading={false}
      {...h}
      {...props}
    />
  )
  return h
}

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('rendering', () => {
  it('shows one row per workspace', () => {
    show()

    expect(screen.getByRole('button', { name: 'Open My SaaS' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open Docs' })).toBeDefined()
  })

  it('says how many terminals a workspace holds, in the plural the user expects', () => {
    show()

    expect(screen.getByRole('button', { name: 'Open My SaaS' }).textContent).toContain(
      '2 terminals'
    )
    expect(screen.getByRole('button', { name: 'Open Docs' }).textContent).toContain('1 terminal')
  })

  it('marks the open workspace', () => {
    show({ activeWorkspaceId: 'ws_b' })

    expect(screen.getByRole('button', { name: 'Open Docs' }).getAttribute('aria-current')).toBe(
      'true'
    )
    expect(screen.getByRole('button', { name: 'Open My SaaS' }).getAttribute('aria-current')).toBe(
      'false'
    )
  })

  it('reports terminals that failed to open', () => {
    show({
      notices: [
        {
          definitionId: 'term_2',
          title: 'Frontend',
          severity: 'error',
          message: 'Git Bash is not available'
        }
      ]
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Frontend')
    expect(alert.textContent).toContain('Git Bash is not available')
  })

  /**
   * Bridge errors moved to toasts in Phase 10 — they are events, not a state of
   * the sidebar. What stays here is the distinction the sidebar alone can make:
   * "still loading" is not "you have none".
   */
  it('says it is still loading rather than claiming there are none', () => {
    show({ workspaces: [], isLoading: true })

    expect(screen.getByRole('status').textContent).toContain('Loading')
    expect(screen.queryByText('No workspaces yet.')).toBeNull()
  })

  it('explains what a workspace is once it knows there are none', () => {
    show({ workspaces: [], isLoading: false })

    expect(screen.getByText('No workspaces yet.')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('opens them together')
  })
})

describe('intents', () => {
  it('reports open with the workspace id', () => {
    const h = show()

    fireEvent.click(screen.getByRole('button', { name: 'Open My SaaS' }))

    expect(h.onOpen).toHaveBeenCalledExactlyOnceWith('ws_a')
  })

  it('reports edit with the workspace id', () => {
    const h = show()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Docs' }))

    expect(h.onEdit).toHaveBeenCalledExactlyOnceWith('ws_b')
  })

  it('reports delete with the workspace id', () => {
    const h = show()

    fireEvent.click(screen.getByRole('button', { name: 'Delete My SaaS' }))

    expect(h.onDelete).toHaveBeenCalledExactlyOnceWith('ws_a')
  })

  it('reports create', () => {
    const h = show()

    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))

    expect(h.onCreate).toHaveBeenCalledTimes(1)
  })
})

/** The sidebar reports intents; the panel above it owns every IPC call. */
describe('boundary', () => {
  it('drives the whole component without touching the bridge', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Open My SaaS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Docs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete My SaaS' }))
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))

    expect(api.calls).toEqual(emptyCalls())
  })
})
