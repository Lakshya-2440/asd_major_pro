import { useState, type FormEvent } from 'react'
import { X, Filter, RotateCcw } from 'lucide-react'

export interface FilterState {
  species?: 'cattle' | 'buffalo' | ''
  breed?: string
  status?: string
  village?: string
  fromDate?: string
  toDate?: string
}

interface FilterDrawerProps {
  isOpen: boolean
  currentFilters: FilterState
  onClose: () => void
  onApply: (filters: FilterState) => void
  onReset: () => void
}

export default function FilterDrawer({
  isOpen,
  currentFilters,
  onClose,
  onApply,
  onReset,
}: FilterDrawerProps) {
  const [filters, setFilters] = useState<FilterState>(currentFilters)

  if (!isOpen) return null

  const handleChange = (field: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const handleApply = (e: FormEvent) => {
    e.preventDefault()
    onApply(filters)
    onClose()
  }

  const handleReset = () => {
    const empty: FilterState = {
      species: '',
      breed: '',
      status: '',
      village: '',
      fromDate: '',
      toDate: '',
    }
    setFilters(empty)
    onReset()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-brand-700" />
            <h3 className="text-base font-bold text-slate-900">Filter Evaluations</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters Form */}
        <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Species</label>
            <select
              value={filters.species || ''}
              onChange={(e) => handleChange('species', e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm font-semibold text-slate-800"
            >
              <option value="">All Species</option>
              <option value="cattle">Cattle</option>
              <option value="buffalo">Buffalo</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Breed Name</label>
            <input
              type="text"
              placeholder="e.g. Gir, Sahiwal, Murrah"
              value={filters.breed || ''}
              onChange={(e) => handleChange('breed', e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm font-semibold text-slate-800"
            >
            </input>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Evaluation Status</label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm font-semibold text-slate-800"
            >
              <option value="">All Statuses</option>
              <option value="analyzed">Analyzed</option>
              <option value="confirmed">Confirmed</option>
              <option value="synced">Synced with BPA</option>
              <option value="failed_quality">Failed Quality</option>
              <option value="pending_analysis">Pending Analysis</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Village</label>
            <input
              type="text"
              placeholder="Filter by village"
              value={filters.village || ''}
              onChange={(e) => handleChange('village', e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm font-semibold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">From Date</label>
              <input
                type="date"
                value={filters.fromDate || ''}
                onChange={(e) => handleChange('fromDate', e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 p-2 text-xs font-semibold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">To Date</label>
              <input
                type="date"
                value={filters.toDate || ''}
                onChange={(e) => handleChange('toDate', e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 p-2 text-xs font-semibold text-slate-800"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-brand-700 py-2.5 text-xs font-bold text-white shadow hover:bg-brand-800"
            >
              Apply Filters
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
