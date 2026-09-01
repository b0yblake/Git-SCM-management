import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

const mount = (): { onConfirm: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      title='Close "demo"?'
      description="Its shell process is still running."
      confirmLabel="Close terminal"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog keyboard contract', () => {
  it('renders the title and the consequence line', () => {
    mount()

    expect(screen.getByRole('dialog', { name: 'Close "demo"?' })).toBeTruthy()
    expect(screen.getByText('Its shell process is still running.')).toBeTruthy()
  })

  it('focuses the confirm button on mount so Enter accepts immediately', () => {
    mount()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close terminal' }))
  })

  it('confirms on Enter even when focus was stolen from the dialog', () => {
    const { onConfirm } = mount()

    screen.getByRole('button', { name: 'Close terminal' }).blur()
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('leaves Enter to the focused button so Enter on Cancel does not confirm', () => {
    const { onConfirm } = mount()

    screen.getByRole('button', { name: 'Cancel' }).focus()
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    const { onCancel } = mount()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab cycling between the two buttons', () => {
    mount()

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close terminal' }))
  })
})
