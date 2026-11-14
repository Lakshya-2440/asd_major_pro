import { useState, useEffect, useTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ArrowRight, User, MapPin, Tag } from 'lucide-react'
import api from '../services/api'
import AnimalFormModal from '../components/AnimalFormModal'
import type { Animal } from '../types/models'

export default function AnimalLookup() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [animals, setAnimals] = useState<Animal[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [, startTransition] = useTransition()

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const query = searchTerm.trim() ? `?tag=${encodeURIComponent(searchTerm.trim())}` : ''
        const { data } = await api.get<{ data: Animal[] }>(`/animals${query}`)
        startTransition(() => {
          setAnimals(data.data ?? [])
        })
      } catch (err) {
        console.error('Failed to search animals', err)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleSelectAnimal = (animal: Animal) => {
    navigate(`/evaluations/capture?animalId=${animal.id}`)
  }

  const handleCreatedAnimal = (animal: Animal) => {
    navigate(`/evaluations/capture?animalId=${animal.id}`)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Animal Identification</h1>
        <p className="text-sm font-semibold text-slate-600">
          Search by Tag ID or register a new animal before photo capture
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
          placeholder="Search Tag ID (e.g. IN-1029)..."
          className="w-full min-h-touch rounded-2xl border-2 border-slate-900 bg-white pl-12 pr-4 py-3.5 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none shadow-sm"
        />
      </div>

      {/* Quick Action: Register New Animal */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="flex w-full min-h-touch items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-600 bg-brand-50/70 p-4 text-sm font-extrabold text-brand-800 transition hover:bg-brand-100/70 active:scale-[0.99]"
      >
        <Plus size={20} className="text-brand-700" />
        <span>Register New Animal With Tag</span>
      </button>

      {/* Search Results List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {searchTerm ? `Matching Results (${animals.length})` : 'Recent Animals'}
          </h2>
          {loading && <span className="text-xs font-semibold text-brand-700">Searching...</span>}
        </div>

        {animals.length === 0 && !loading ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <Tag size={32} className="mx-auto text-slate-400 mb-2" />
            <h3 className="text-base font-bold text-slate-800">No animal found</h3>
            <p className="mt-1 text-xs text-slate-500">
              {searchTerm
                ? `No record matches tag "${searchTerm}". Register this animal now.`
                : 'No registered animals yet.'}
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-brand-800"
            >
              <Plus size={16} />
              Register Animal
            </button>
          </div>
        ) : (
          animals.map((animal) => (
            <div
              key={animal.id}
              className="flex flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-lg font-black tracking-tight text-slate-900">
                    #{animal.tag_id}
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800 uppercase">
                      {animal.species}
                    </span>
                    <span className="text-xs font-bold text-slate-700">{animal.breed}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectAnimal(animal)}
                  className="flex min-h-touch items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-brand-800"
                >
                  <span>Start Scan</span>
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Owner and village metadata */}
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-2 text-xs font-medium text-slate-500">
                {animal.owner_name && (
                  <span className="flex items-center gap-1">
                    <User size={13} />
                    {animal.owner_name}
                  </span>
                )}
                {animal.village && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} />
                    {animal.village}
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
