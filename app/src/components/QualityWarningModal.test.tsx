import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import QualityWarningModal from './QualityWarningModal'

describe('QualityWarningModal', () => {
  it('renders flags with guidance and dispatches actions', () => {
    const handleRetake = vi.fn()
    const handleProceed = vi.fn()

    render(
      <QualityWarningModal
        isOpen={true}
        flags={['blurry', 'marker_missing']}
        onRetake={handleRetake}
        onProceedAnyway={handleProceed}
      />,
    )

    expect(screen.getByText('Image Quality Warning')).toBeInTheDocument()
    expect(screen.getByText('Image is Blurry')).toBeInTheDocument()
    expect(screen.getByText('Reference Marker Missing')).toBeInTheDocument()

    const retakeBtn = screen.getByRole('button', { name: /Retake Photo/i })
    fireEvent.click(retakeBtn)
    expect(handleRetake).toHaveBeenCalledTimes(1)

    const proceedBtn = screen.getByRole('button', { name: /Proceed Anyway/i })
    fireEvent.click(proceedBtn)
    expect(handleProceed).toHaveBeenCalledTimes(1)
  })
})
