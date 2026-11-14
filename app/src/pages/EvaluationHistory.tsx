import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Plus, RefreshCw, FileText } from 'lucide-react'
import api from '../services/api'
import EvaluationCard from '../components/EvaluationCard'
import FilterDrawer, { type FilterState } from '../components/FilterDrawer'
import type { Evaluation } from '../types/models'

type ChipFilter = 'all' | 'cattle' | 'buffalo' | 'synced' | 'pending'

export default function EvaluationHistory() {
  const navigate = useNavigate()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeChip, setActiveChip] = useState<ChipFilter>('all')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({})

  useEffect(() => {
    let active = true
    const params = new URLSearchParams()
    if (advancedFilters.species) {
      params.set('species', advancedFilters.species)
    } else if (activeChip === 'cattle') {
      params.set('species', 'cattle')
    } else if (activeChip === 'buffalo') {
      params.set('species', 'buffalo')
    }

    if (advancedFilters.status) {
      params.set('status', advancedFilters.status)
    } else if (activeChip === 'synced') {
      params.set('status', 'synced')
    }

    if (advancedFilters.breed) params.set('breed', advancedFilters.breed)
    if (advancedFilters.village) params.set('village', advancedFilters.village)
    if (advancedFilters.fromDate) params.set('from_date', advancedFilters.fromDate)
    if (advancedFilters.toDate) params.set('to_date', advancedFilters.toDate)

    api
      .get<{ data: Evaluation[] }>(`/evaluations?${params.toString()}`)
      .then(({ data }) => {
        if (active) {
          setEvaluations(data.data ?? [])
        }
      })
      .catch((err) => {
        console.error('Failed to fetch evaluations', err)
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeChip, advancedFilters])

  // Filter client-side by search term (Tag ID or village)
  const filteredEvaluations = evaluations.filter((ev) => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true
    const tagMatch = ev.animal?.tag_id?.toLowerCase().includes(term)
    const villageMatch = ev.animal?.village?.toLowerCase().includes(term)
    const breedMatch = ev.animal?.breed?.toLowerCase().includes(term)
    return tagMatch || villageMatch || breedMatch
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Evaluation Records</h1>
          <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
            Bovine phenotype history, AI landmark coordinates, and Bharat Pashudhan App audit log
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/animals/new')}
            className="flex min-h-touch items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 transition"
          >
            <Plus size={16} />
            <span>New Animal Scan</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Filter Drawer Toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Tag ID, Breed, or Village..."
            className="w-full min-h-touch rounded-2xl border-2 border-slate-300 bg-white pl-11 pr-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none shadow-sm transition"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className={`flex min-h-touch items-center justify-center gap-2 rounded-2xl border-2 px-5 py-3 text-xs font-bold transition shadow-sm ${
            Object.values(advancedFilters).some(Boolean)
              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span>Advanced Filters</span>
        </button>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(
          [
            { id: 'all', label: 'All Records' },
            { id: 'cattle', label: 'Cattle' },
            { id: 'buffalo', label: 'Buffalo' },
            { id: 'synced', label: 'BPA Synced' },
            { id: 'pending', label: 'Pending Sync' },
          ] as { id: ChipFilter; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setLoading(true)
              setActiveChip(id)
            }}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm ${
              activeChip === id
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Evaluation List or Empty State */}
      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center p-6 text-center">
          <RefreshCw size={28} className="animate-spin text-emerald-600 mb-2" />
          <p className="text-xs font-bold text-slate-500">Loading evaluation records...</p>
        </div>
      ) : filteredEvaluations.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <FileText size={40} className="mx-auto text-slate-400 mb-2" />
          <h2 className="text-base font-bold text-slate-800">No Evaluations Found</h2>
          <p className="mt-1 text-xs text-slate-500">
            {searchTerm || activeChip !== 'all'
              ? 'No evaluations match your search criteria.'
              : 'No animal evaluations recorded yet.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/animals/new')}
            className="mt-4 inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-500"
          >
            <Plus size={16} />
            Start First Scan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvaluations.map((ev) => (
            <EvaluationCard key={ev.id} evaluation={ev} />
          ))}
        </div>
      )}

      {/* Filter Drawer */}
      <FilterDrawer
        isOpen={isDrawerOpen}
        currentFilters={advancedFilters}
        onClose={() => setIsDrawerOpen(false)}
        onApply={(f) => {
          setLoading(true)
          setAdvancedFilters(f)
        }}
        onReset={() => {
          setLoading(true)
          setAdvancedFilters({})
        }}
      />
    </div>
  )
}
