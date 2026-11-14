export type Species = 'cattle' | 'buffalo'

export const SPECIES_LABELS: Record<Species, string> = {
  cattle: 'Cattle',
  buffalo: 'Buffalo',
}

// Gir and Sahiwal are cattle breeds; Murrah is a buffalo breed
export const BREEDS_BY_SPECIES: Record<Species, string[]> = {
  cattle: ['Gir', 'Sahiwal', 'Other'],
  buffalo: ['Murrah', 'Other'],
}

export interface Animal {
  id: string | number
  tag_id: string
  species: Species
  breed: string
  owner_name: string | null
  village: string | null
  evaluation_count?: number
}

export interface NewAnimal {
  tag_id: string
  species: Species
  breed: string
  owner_name: string
  village: string
}