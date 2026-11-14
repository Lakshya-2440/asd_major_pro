import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GuidanceOverlay from './GuidanceOverlay'

describe('GuidanceOverlay', () => {
  it('displays level and ready indicator when phone is level', () => {
    render(
      <GuidanceOverlay
        isLevel={true}
        pitchError={1}
        rollError={1}
        overrideLevel={false}
        onToggleOverride={vi.fn()}
      />,
    )
    expect(screen.getByText('Camera Level & Ready')).toBeInTheDocument()
  })

  it('displays tilt warning when phone is not level', () => {
    render(
      <GuidanceOverlay
        isLevel={false}
        pitchError={12}
        rollError={8}
        overrideLevel={false}
        onToggleOverride={vi.fn()}
      />,
    )
    expect(screen.getByText('Tilt camera perpendicular to ground')).toBeInTheDocument()
  })

  it('allows toggling sensor override', () => {
    const handleToggle = vi.fn()
    render(
      <GuidanceOverlay
        isLevel={false}
        pitchError={15}
        rollError={10}
        overrideLevel={false}
        onToggleOverride={handleToggle}
      />,
    )

    const bypassBtn = screen.getByRole('button', { name: /Bypass Level Check/i })
    fireEvent.click(bypassBtn)
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })
})
