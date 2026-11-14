import { useState, type FormEvent } from 'react'
import { X, Sparkles, CheckCircle2 } from 'lucide-react'
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

const PRESET_ANIMALS: Array<{
  label: string
  tag: string
  species: Species
  breed: string
  owner: string
  village: string
}> = [
  { label: '🐄 Gir Cattle (76R7)', tag: '76R7', species: 'cattle', breed: 'Gir', owner: 'Ramesh Patel', village: 'Anand, Gujarat' },
  { label: '🐃 Murrah Buffalo (MU-4091)', tag: 'MU-4091', species: 'buffalo', breed: 'Murrah', owner: 'Suresh Kumar', village: 'Rohtak, Haryana' },
  { label: '🐄 Sahiwal Cattle (SH-203)', tag: 'SH-203', species: 'cattle', breed: 'Sahiwal', owner: 'Baldev Singh', village: 'Fazilka, Punjab' },
]

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
  const [statusNotice, setStatusNotice] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSpeciesChange = (newSpecies: Species) => {
    setSpecies(newSpecies)
    setBreed(BREED_OPTIONS[newSpecies][0])
  }

  const applyPreset = (preset: typeof PRESET_ANIMALS[number]) => {
    setTagId(preset.tag)
    setSpecies(preset.species)
    setBreed(preset.breed)
    setOwnerName(preset.owner)
    setVillage(preset.village)
    setStatusNotice(`Loaded preset for ${preset.label}`)
    setTimeout(() => setStatusNotice(null), 2500)
  }

  const saveLocalAnimal = (animal: Animal) => {
    try {
      const stored = localStorage.getItem('cached_animals')
      const list: Animal[] = stored ? JSON.parse(stored) : []
      const updated = [animal, ...list.filter((a) => a.tag_id !== animal.tag_id)]
      localStorage.setItem('cached_animals', JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to cache animal locally', e)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleanTag = tagId.trim().toUpperCase()
    if (!cleanTag) {
      setStatusNotice('Animal Tag ID is required')
      return
    }

    const finalBreed = breed.startsWith('Other') && customBreed.trim() ? customBreed.trim() : breed
    const finalOwner = ownerName.trim() || 'Ramesh Patel'
    const finalVillage = village.trim() || 'Anand, Gujarat'

    const localFallbackAnimal: Animal = {
      id: `anim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tag_id: cleanTag,
      species,
      breed: finalBreed,
      owner_name: finalOwner,
      village: finalVillage,
      created_at: new Date().toISOString(),
      previous_evaluations_count: 0,
    }

    setSubmitting(true)
    setStatusNotice(null)

    try {
      const response = await api.post<Animal>('/animals', {
        tag_id: cleanTag,
        species,
        breed: finalBreed,
        owner_name: finalOwner,
        village: finalVillage,
      })
      const savedAnimal = response.data || localFallbackAnimal
      saveLocalAnimal(savedAnimal)
      onSuccess(savedAnimal)
      onClose()
    } catch (err: unknown) {
      // Graceful offline/demo fallback - never block the user!
      console.warn('Backend API registration failed, storing animal in local session cache:', err)
      saveLocalAnimal(localFallbackAnimal)
      onSuccess(localFallbackAnimal)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md transition-all">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/20">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 via-white to-slate-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Register Animal</h2>
              <p className="text-xs font-semibold text-slate-500">Bharat Pashudhan (BPA) Standard Profile</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Fill Demo Bar */}
        <div className="border-b border-slate-100 bg-slate-50/90 px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              1-Click Demo Presets:
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESET_ANIMALS.map((preset) => (
              <button
                key={preset.tag}
                type="button"
                onClick={() => applyPreset(preset)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50/80 hover:text-emerald-900 active:scale-95"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {statusNotice && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span>{statusNotice}</span>
            </div>
          )}

          {/* Tag ID */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Animal Tag ID <span className="text-emerald-600">*</span>
            </label>
            <input
              type="text"
              required
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              placeholder="e.g. 76R7 or IN-1029"
              className="w-full min-h-touch rounded-2xl border-2 border-slate-200 bg-slate-50/50 p-3.5 font-mono text-base font-black text-slate-900 uppercase tracking-wider placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none transition shadow-sm"
            />
          </div>

          {/* Species Selector */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">Species</label>
            <div className="grid grid-cols-2 gap-2.5">
              {(['cattle', 'buffalo'] as Species[]).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => handleSpeciesChange(sp)}
                  className={`min-h-touch rounded-2xl border-2 py-3 text-sm font-black capitalize transition shadow-sm ${
                    species === sp
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-emerald-500/10'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {sp === 'cattle' ? '🐄 Cattle (Cow)' : '🐃 Buffalo'}
                </button>
              ))}
            </div>
          </div>

          {/* Breed Selector */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">Breed</label>
            <select
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              className="w-full min-h-touch rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-sm font-black text-slate-900 focus:border-emerald-600 focus:outline-none transition shadow-sm"
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
                className="mt-2 w-full min-h-touch rounded-2xl border-2 border-slate-200 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            )}
          </div>

          {/* Owner & Village */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">Owner Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Ramesh Patel"
                className="w-full min-h-touch rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">Village / Location</label>
              <input
                type="text"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder="e.g. Anand, Gujarat"
                className="w-full min-h-touch rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-touch rounded-2xl border border-slate-300 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-touch rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
