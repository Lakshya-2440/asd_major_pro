import api from './api'
import type { Animal, NewAnimal } from '../types/animal'

// Ear tags are often printed in groups ("1234 5678 9012"), so we search and store them without spaces
export const normalizeTag = (value: string) => value.replace(/\s+/g, '')

// ASSUMPTION (PR 11 isn't merged yet): GET /api/animals returns an array of animals,
// or an object wrapping that array. If the real response differs, fix it here only.
export async function searchAnimals(tag: string, signal?: AbortSignal): Promise<Animal[]> {
  const { data } = await api.get('/animals', { params: { tag }, signal })
  const list = Array.isArray(data) ? data : (data?.animals ?? data?.data ?? [])
  return list as Animal[]
}

export async function createAnimal(input: NewAnimal): Promise<Animal> {
  const { data } = await api.post('/animals', input)
  return (data?.animal ?? data) as Animal
}