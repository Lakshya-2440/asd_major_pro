import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BpaSyncBadge from './BpaSyncBadge'

describe('BpaSyncBadge', () => {
  it('renders synced badge with green styling and label', () => {
    render(<BpaSyncBadge status="synced" referenceId="REF-12345" />)
    const badge = screen.getByText('BPA Synced')
    expect(badge).toBeInTheDocument()
    expect(badge.closest('span[title]')).toHaveAttribute('title', 'Ref: REF-12345')
  })

  it('renders pending badge when status is pending or null', () => {
    render(<BpaSyncBadge status={null} />)
    expect(screen.getByText('Pending BPA')).toBeInTheDocument()
  })

  it('renders failed badge when status is failed', () => {
    render(<BpaSyncBadge status="failed" />)
    expect(screen.getByText('Sync Failed')).toBeInTheDocument()
  })
})
