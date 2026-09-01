import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalLayoutToolbar } from './TerminalLayoutToolbar'

afterEach(cleanup)

describe('TerminalLayoutToolbar', () => {
  it('renders all four presets and marks the current one', () => {
    render(<TerminalLayoutToolbar mode="grid" visibleCount={4} onChange={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Focus' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('4 visible')).toBeDefined()
  })

  it('reports a layout change without owning layout state', () => {
    const onChange = vi.fn()
    render(<TerminalLayoutToolbar mode="grid" visibleCount={3} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Main + Side' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('main-side')
  })
})
