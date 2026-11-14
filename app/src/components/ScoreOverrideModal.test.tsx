import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ScoreOverrideModal from './ScoreOverrideModal'

describe('ScoreOverrideModal', () => {
  it('renders trait name, ai score and allows selecting score with required reason', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <ScoreOverrideModal
        isOpen={true}
        traitName="body_depth"
        currentAiScore={6}
        currentFinalScore={6}
        onClose={handleClose}
        onSave={handleSave}
      />,
    )

    expect(screen.getByText('Body Depth')).toBeInTheDocument()
    expect(screen.getAllByText('6 / 9')).toHaveLength(2)

    // Pick score 8
    const button8 = screen.getByRole('button', { name: '8' })
    fireEvent.click(button8)

    // Fill reason
    const textarea = screen.getByPlaceholderText(/Animal stood on uneven slope/i)
    fireEvent.change(textarea, { target: { value: 'Shadow obscured brisket floor contour' } })

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /Save Override/i })
    fireEvent.click(submitBtn)

    expect(handleSave).toHaveBeenCalledWith(8, 'Shadow obscured brisket floor contour')
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ScoreOverrideModal
        isOpen={false}
        traitName="stature"
        currentAiScore={5}
        currentFinalScore={5}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
