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
    <div className="p-4 sm:p-6 space-y-5">
      {/* Top Title & Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Evaluations</h1>
          <p className="text-xs font-semibold text-slate-600">
            Records, AI phenotyping history & BPA sync audit
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="flex min-h-touch items-center gap-1.5 rounded-xl bg-brand-700 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-brand-800"
        >
          <Plus size={16} />
          <span>New Scan</span>
        </button>
      </div>

      {/* Search Bar & Filter Drawer Toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Tag ID or Village..."
            className="w-full min-h-touch rounded-2xl border-2 border-slate-300 bg-white pl-10 pr-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className={`flex min-h-touch items-center gap-1 rounded-2xl border-2 px-3 text-xs font-bold transition ${
            Object.values(advancedFilters).some(Boolean)
              ? 'border-brand-600 bg-brand-50 text-brand-800'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'cattle', label: 'Cattle' },
            { id: 'buffalo', label: 'Buffalo' },
            { id: 'synced', label: 'Synced' },
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
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeChip === id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Evaluation List or Empty State */}
      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center p-6 text-center">
          <RefreshCw size={28} className="animate-spin text-brand-600 mb-2" />
          <p className="text-xs font-bold text-slate-500">Loading evaluation records...</p>
        </div>
      ) : filteredEvaluations.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
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
            className="mt-4 inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-brand-800"
          >
            <Plus size={16} />
            Start First Scan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
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
