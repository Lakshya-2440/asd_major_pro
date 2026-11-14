import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnimalFormModal from './AnimalFormModal'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../services/api', () => ({ default: { post } }))

const created = {
  id: 7,
  tag_id: '12345678',
  species: 'cattle',
  breed: 'Gir',
  owner_name: 'Ramesh',
  village: 'Shirur',
}

type User = ReturnType<typeof userEvent.setup>

function setup(initialTag = '') {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  const user = userEvent.setup()
  render(<AnimalFormModal initialTag={initialTag} onClose={onClose} onCreated={onCreated} />)
  return { user, onClose, onCreated }
}

const save = () => screen.getByRole('button', { name: /save/i })

const breedOptions = () =>
  within(screen.getByLabelText(/^breed/i))
    .getAllByRole('option')
    .map((option) => option.textContent)

async function fillRequired(user: User) {
  await user.type(screen.getByLabelText(/^tag id/i), 'GIR-001')
  await user.selectOptions(screen.getByLabelText(/^species/i), 'cattle')
  await user.selectOptions(screen.getByLabelText(/^breed/i), 'Gir')
}

describe('AnimalFormModal', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('prefills the tag and closes on Escape', async () => {
    const { user, onClose } = setup('GIR-001')
    expect(screen.getByLabelText(/^tag id/i)).toHaveValue('GIR-001')

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows validation errors and does not submit an empty form', async () => {
    const { user } = setup()

    await user.click(save())

    expect(screen.getByText('Tag ID is required.')).toBeInTheDocument()
    expect(screen.getByText('Select a species.')).toBeInTheDocument()
    expect(screen.getByText('Select a breed.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects tag IDs with invalid characters', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText(/^tag id/i), 'GIR_001')
    await user.click(save())

    expect(screen.getByText('Use letters, numbers and hyphens only.')).toBeInTheDocument()
  })

  it('limits breed options to the selected species and resets the breed', async () => {
    const { user } = setup()
    expect(screen.getByLabelText(/^breed/i)).toBeDisabled()

    await user.selectOptions(screen.getByLabelText(/^species/i), 'cattle')
    expect(breedOptions()).toEqual(['Select breed', 'Gir', 'Sahiwal', 'Other'])

    await user.selectOptions(screen.getByLabelText(/^breed/i), 'Gir')
    await user.selectOptions(screen.getByLabelText(/^species/i), 'buffalo')

    expect(breedOptions()).toEqual(['Select breed', 'Murrah', 'Other'])
    expect(screen.getByLabelText(/^breed/i)).toHaveValue('')
  })

  it('creates the animal with a space-free tag and passes it to onCreated', async () => {
    post.mockResolvedValue({ data: created })
    const { user, onCreated } = setup()

    await user.type(screen.getByLabelText(/^tag id/i), '1234 5678')
    await user.selectOptions(screen.getByLabelText(/^species/i), 'cattle')
    await user.selectOptions(screen.getByLabelText(/^breed/i), 'Gir')
    await user.type(screen.getByLabelText(/^owner name/i), 'Ramesh')
    await user.type(screen.getByLabelText(/^village/i), 'Shirur')
    await user.click(save())

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    expect(post).toHaveBeenCalledWith('/animals', {
      tag_id: '12345678',
      species: 'cattle',
      breed: 'Gir',
      owner_name: 'Ramesh',
      village: 'Shirur',
    })
  })

  it('shows an inline error when the tag is already registered (409)', async () => {
    post.mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
      } as AxiosResponse),
    )
    const { user, onCreated } = setup()

    await fillRequired(user)
    await user.click(save())

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })
})