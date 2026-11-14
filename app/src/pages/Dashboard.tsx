import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, History, PlusCircle, ArrowRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import EvaluationCard from '../components/EvaluationCard'
import type { Evaluation } from '../types/models'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recentEvaluations, setRecentEvaluations] = useState<Evaluation[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [syncedCount, setSyncedCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api
      .get<{ data: Evaluation[]; pagination: { total: number } }>('/evaluations?limit=5')
      .then((res) => {
        if (!active) return
        const evals = res.data.data ?? []
        setRecentEvaluations(evals)
        setTotalCount(res.data.pagination?.total ?? evals.length)
        const synced = evals.filter(
          (e) => e.status === 'synced' || e.bpa_sync?.some((s) => s.status === 'synced'),
        ).length
        setSyncedCount(synced)
      })
      .catch((err) => {
        console.error('Failed to load dashboard evaluations', err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Field Operative
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Hello, {user?.name || 'Field Typer'}
          </h1>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <ShieldCheck size={24} />
        </div>
      </div>

      {/* Main Call to Action: Start New Scan */}
      <div className="overflow-hidden rounded-3xl border-2 border-slate-900 bg-brand-700 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-2">
          <span className="inline-block w-fit rounded-full bg-brand-800/80 px-3 py-1 text-xs font-bold text-brand-200">
            AI Automated Assessment
          </span>
          <h2 className="text-xl font-black leading-tight">Ready to score livestock?</h2>
          <p className="text-xs font-medium text-brand-100">
            Capture side profile, extract keypoints, compute linear classification 1-9 scores.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="mt-5 flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-base font-extrabold text-slate-900 shadow-md transition active:scale-[0.99] hover:bg-slate-50"
        >
          <ScanLine size={20} className="text-brand-700" />
          <span>Start New Scan</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-center shadow-xs">
          <span className="text-xs font-bold text-slate-500">Total Scans</span>
          <p className="mt-1 text-xl font-black text-slate-900">{totalCount}</p>
        </div>
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-center shadow-xs">
          <span className="text-xs font-bold text-emerald-600">BPA Synced</span>
          <p className="mt-1 text-xl font-black text-emerald-700">{syncedCount}</p>
        </div>
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-center shadow-xs">
          <span className="text-xs font-bold text-amber-600">Pending</span>
          <p className="mt-1 text-xl font-black text-amber-700">
            {Math.max(0, totalCount - syncedCount)}
          </p>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="flex min-h-touch items-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left font-bold text-slate-800 shadow-xs hover:border-slate-400 active:bg-slate-50"
        >
          <PlusCircle size={20} className="text-brand-700 shrink-0" />
          <div className="text-xs leading-tight">
            <span>Register</span>
            <span className="block text-slate-500 font-normal">New Animal</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/evaluations')}
          className="flex min-h-touch items-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left font-bold text-slate-800 shadow-xs hover:border-slate-400 active:bg-slate-50"
        >
          <History size={20} className="text-slate-700 shrink-0" />
          <div className="text-xs leading-tight">
            <span>Past Records</span>
            <span className="block text-slate-500 font-normal">Sync Status</span>
          </div>
        </button>
      </div>

      {/* Recent Evaluations Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
            Recent Evaluations
          </h2>
          <button
            type="button"
            onClick={() => navigate('/evaluations')}
            className="flex items-center gap-0.5 text-xs font-bold text-brand-700 hover:text-brand-800"
          >
            <span>See all</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs font-semibold text-slate-400">
            Loading recent records...
          </div>
        ) : recentEvaluations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 font-medium">
            No evaluations completed yet. Tap &ldquo;Start New Scan&rdquo; above!
          </div>
        ) : (
          <div className="space-y-3">
            {recentEvaluations.map((ev) => (
              <EvaluationCard key={ev.id} evaluation={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
