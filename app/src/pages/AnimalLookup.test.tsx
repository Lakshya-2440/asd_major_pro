import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnimalLookup from './AnimalLookup'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../services/api', () => ({ default: { get, post } }))

const gir = {
  id: 7,
  tag_id: '12345678',
  species: 'cattle',
  breed: 'Gir',
  owner_name: 'Ramesh Patil',
  village: 'Shirur',
  evaluation_count: 2,
}

function CaptureProbe() {
  const [params] = useSearchParams()
  return <p>Capture for animal {params.get('animalId')}</p>
}

function renderLookup() {
  return render(
    <MemoryRouter initialEntries={['/animals/new']}>
      <Routes>
        <Route path="/animals/new" element={<AnimalLookup debounceMs={200} />} />
        <Route path="/evaluations/capture" element={<CaptureProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AnimalLookup', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('shows the search bar and makes no request until a tag is typed', () => {
    renderLookup()

    expect(screen.getByLabelText('Animal Tag ID')).toBeInTheDocument()
    expect(screen.getByText(/type a tag id/i)).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })

  it('debounces the search and shows the matching animal card', async () => {
    get.mockResolvedValue({ data: [gir] })
    const user = userEvent.setup()
    renderLookup()

    await user.type(screen.getByLabelText('Animal Tag ID'), '1234 5678')

    const card = await screen.findByRole('link', { name: /start evaluation/i })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(
      '/animals',
      expect.objectContaining({ params: { tag: '12345678' } }),
    )
    expect(card).toHaveAttribute('href', '/evaluations/capture?animalId=7')
    for (const text of ['12345678', 'Cattle', 'Gir', 'Shirur', 'Ramesh Patil', '2 previous evaluations']) {
      expect(card).toHaveTextContent(text)
    }
  })

  it('shows an empty state, registers the animal and goes to capture', async () => {
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({ data: { ...gir, id: 9, tag_id: '99999' } })
    const user = userEvent.setup()
    renderLookup()

    await user.type(screen.getByLabelText('Animal Tag ID'), '99999')
    expect(await screen.findByText('No animal found')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /register new animal/i }))
    const dialog = screen.getByRole('dialog', { name: /register new animal/i })
    expect(within(dialog).getByLabelText(/^tag id/i)).toHaveValue('99999')

    await user.selectOptions(within(dialog).getByLabelText(/^species/i), 'cattle')
    await user.selectOptions(within(dialog).getByLabelText(/^breed/i), 'Gir')
    await user.click(within(dialog).getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Capture for animal 9')).toBeInTheDocument()
  })

  it('shows an error alert when the search fails', async () => {
    get.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    renderLookup()

    await user.type(screen.getByLabelText('Animal Tag ID'), '123')

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not search/i)
  })
})