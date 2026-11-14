import { useState, useEffect, useTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ArrowRight, User, MapPin, Tag, Sparkles } from 'lucide-react'
import api from '../services/api'
import AnimalFormModal from '../components/AnimalFormModal'
import type { Animal } from '../types/models'

const DEFAULT_ANIMALS: Animal[] = [
  {
    id: '76r70000-0000-4000-8000-000000000001',
    tag_id: '76R7',
    species: 'cattle',
    breed: 'Gir',
    owner_name: 'Ramesh Patel',
    village: 'Anand, Gujarat',
    created_at: new Date().toISOString(),
    previous_evaluations_count: 1,
  },
  {
    id: 'mu409100-0000-4000-8000-000000000002',
    tag_id: 'MU-4091',
    species: 'buffalo',
    breed: 'Murrah',
    owner_name: 'Suresh Kumar',
    village: 'Rohtak, Haryana',
    created_at: new Date().toISOString(),
    previous_evaluations_count: 2,
  },
  {
    id: 'sh020300-0000-4000-8000-000000000003',
    tag_id: 'SH-203',
    species: 'cattle',
    breed: 'Sahiwal',
    owner_name: 'Baldev Singh',
    village: 'Fazilka, Punjab',
    created_at: new Date().toISOString(),
    previous_evaluations_count: 0,
  },
]

function getLocalAnimals(): Animal[] {
  try {
    const raw = localStorage.getItem('cached_animals')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function AnimalLookup() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [animals, setAnimals] = useState<Animal[]>(() => {
    const local = getLocalAnimals()
    const all = [...local, ...DEFAULT_ANIMALS]
    const seen = new Set<string>()
    return all.filter((a) => {
      const tag = a.tag_id.toUpperCase()
      if (seen.has(tag)) return false
      seen.add(tag)
      return true
    })
  })
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [, startTransition] = useTransition()

  // Debounced search combining API and local cache
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      const q = searchTerm.trim().toUpperCase()
      const local = getLocalAnimals()
      const combinedDefaults = [...local, ...DEFAULT_ANIMALS]

      try {
        const query = searchTerm.trim() ? `?tag=${encodeURIComponent(searchTerm.trim())}` : ''
        const { data } = await api.get<{ data: Animal[] }>(`/animals${query}`)
        const apiList = data.data ?? []

        // Merge api and local items uniquely
        const mergedMap = new Map<string, Animal>()
        apiList.forEach((a) => mergedMap.set(a.tag_id.toUpperCase(), a))
        combinedDefaults.forEach((a) => {
          if (!mergedMap.has(a.tag_id.toUpperCase())) {
            if (!q || a.tag_id.toUpperCase().includes(q)) {
              mergedMap.set(a.tag_id.toUpperCase(), a)
            }
          }
        })

        startTransition(() => {
          setAnimals(Array.from(mergedMap.values()))
        })
      } catch (err) {
        console.warn('API lookup failed, falling back to local registry', err)
        startTransition(() => {
          const filtered = combinedDefaults.filter((a) => !q || a.tag_id.toUpperCase().includes(q))
          setAnimals(filtered)
        })
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleSelectAnimal = (animal: Animal) => {
    navigate(`/evaluations/capture?animalId=${animal.id}`)
  }

  const handleCreatedAnimal = (animal: Animal) => {
    navigate(`/evaluations/capture?animalId=${animal.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-black uppercase tracking-wider mb-2">
          <Sparkles size={13} className="text-emerald-600" />
          <span>Rashtriya Gokul Mission · Field ATC</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Animal Identification</h1>
        <p className="text-sm font-semibold text-slate-600 mt-1">
          Search by Tag ID or register a new bovine subject before photographic evaluation
        </p>
      </div>

      {/* Large Sunlight-Friendly Search Input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
          <Search size={22} />
        </div>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search Tag ID (e.g. 76R7, MU-4091)..."
          className="w-full min-h-touch rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-4 py-3.5 text-base font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-emerald-600 focus:outline-none shadow-sm transition"
        />
      </div>

      {/* Quick Action: Register New Animal */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="flex w-full min-h-touch items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50/70 p-4 text-sm font-black text-emerald-900 transition hover:bg-emerald-100 hover:border-emerald-600 active:scale-[0.99] shadow-sm"
      >
        <Plus size={20} className="text-emerald-700" />
        <span>Register New Animal With Tag</span>
      </button>

      {/* Search Results List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
            {searchTerm ? `Matching Results (${animals.length})` : `Available Animals (${animals.length})`}
          </h2>
          {loading && <span className="text-xs font-black text-emerald-700 animate-pulse">Syncing...</span>}
        </div>

        {animals.length === 0 && !loading ? (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <Tag size={36} className="mx-auto text-slate-400 mb-2" />
            <h3 className="text-base font-black text-slate-800">No animal found</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {searchTerm
                ? `No record matches tag "${searchTerm}". Register this animal now.`
                : 'No registered animals in this database yet.'}
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex min-h-touch items-center gap-1.5 rounded-2xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition"
            >
              <Plus size={16} />
              Register Animal
            </button>
          </div>
        ) : (
          animals.map((animal) => (
            <div
              key={animal.id}
              className="group flex flex-col gap-3 rounded-2xl border-2 border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-emerald-600 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-black tracking-tight text-slate-900 group-hover:text-emerald-700 transition">
                      #{animal.tag_id}
                    </span>
                    <span className="rounded-lg bg-emerald-100/80 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-emerald-800">
                      {animal.species === 'cattle' ? '🐄 Cattle' : '🐃 Buffalo'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Breed: {animal.breed}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectAnimal(animal)}
                  className="flex min-h-touch items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition"
                >
                  <span>Start Scan</span>
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Owner and village metadata */}
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-2.5 text-xs font-semibold text-slate-500">
                {animal.owner_name && (
                  <span className="flex items-center gap-1.5">
                    <User size={14} className="text-slate-400" />
                    <span>{animal.owner_name}</span>
                  </span>
                )}
                {animal.village && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-slate-400" />
                    <span>{animal.village}</span>
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal for Animal Registration */}
      <AnimalFormModal
        isOpen={isModalOpen}
        initialTag={searchTerm}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleCreatedAnimal}
      />
    </div>
  )
}
