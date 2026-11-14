import { useState, type FormEvent } from 'react'
import { X, Plus, AlertCircle } from 'lucide-react'
import api from '../services/api'
import type { Animal, Species } from '../types/models'

interface AnimalFormModalProps {
  isOpen: boolean
  initialTag?: string
  onClose: () => void
  onSuccess: (animal: Animal) => void
}

const BREED_OPTIONS: Record<Species, string[]> = {
  cattle: ['Gir', 'Sahiwal', 'Red Sindhi', 'Tharparkar', 'Kankrej', 'Hariana', 'Other / Crossbred'],
  buffalo: ['Murrah', 'Nili-Ravi', 'Jaffarabadi', 'Surti', 'Mehsana', 'Bhadawari', 'Other'],
}

export default function AnimalFormModal({
  isOpen,
  initialTag = '',
  onClose,
  onSuccess,
}: AnimalFormModalProps) {
  const [tagId, setTagId] = useState(initialTag)
  const [species, setSpecies] = useState<Species>('cattle')
  const [breed, setBreed] = useState<string>('Gir')
  const [customBreed, setCustomBreed] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [village, setVillage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSpeciesChange = (newSpecies: Species) => {
    setSpecies(newSpecies)
    setBreed(BREED_OPTIONS[newSpecies][0])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!tagId.trim()) {
      setError('Animal Tag ID is required')
      return
    }

    const finalBreed = breed.startsWith('Other') && customBreed.trim() ? customBreed.trim() : breed

    setError(null)
    setSubmitting(true)
    try {
      const response = await api.post<Animal>('/animals', {
        tag_id: tagId.trim(),
        species,
        breed: finalBreed,
        owner_name: ownerName.trim() || 'Unknown Owner',
        village: village.trim() || 'Unknown Village',
      })
      onSuccess(response.data)
      onClose()
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axErr = err as { response?: { data?: { error?: string } } }
        setError(axErr.response?.data?.error || 'Failed to register animal')
      } else {
        setError('Network or server error while registering animal')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <Plus size={20} className="text-brand-700" />
            <h2 className="text-base font-bold text-slate-900">Register New Animal</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tag ID */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Animal Tag ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              placeholder="e.g. IN-MH-10294"
              className="w-full min-h-touch rounded-xl border-2 border-slate-300 p-3 font-mono text-sm font-bold text-slate-900 uppercase focus:border-brand-600 focus:outline-none"
            />
          </div>

          {/* Species Radio Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Species</label>
            <div className="grid grid-cols-2 gap-2">
              {(['cattle', 'buffalo'] as Species[]).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => handleSpeciesChange(sp)}
                  className={`min-h-touch rounded-xl border-2 py-2 text-sm font-bold capitalize transition-colors ${
                    species === sp
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>

          {/* Breed Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Breed</label>
            <select
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              className="w-full min-h-touch rounded-xl border-2 border-slate-300 bg-white p-3 text-sm font-bold text-slate-900 focus:border-brand-600 focus:outline-none"
            >
              {BREED_OPTIONS[species].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {breed.startsWith('Other') && (
              <input
                type="text"
                placeholder="Specify breed name"
                value={customBreed}
                onChange={(e) => setCustomBreed(e.target.value)}
                className="mt-2 w-full min-h-touch rounded-xl border-2 border-slate-300 p-3 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
              />
            )}
          </div>

          {/* Owner & Village */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Owner Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Ramesh Patel"
                className="w-full min-h-touch rounded-xl border-2 border-slate-300 p-3 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Village</label>
              <input
                type="text"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder="e.g. Anand"
                className="w-full min-h-touch rounded-xl border-2 border-slate-300 p-3 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-touch rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-touch rounded-xl bg-brand-700 py-2.5 text-sm font-bold text-white shadow hover:bg-brand-800 disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
