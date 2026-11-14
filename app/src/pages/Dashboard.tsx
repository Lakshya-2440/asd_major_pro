import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, History, PlusCircle, ArrowRight, ShieldCheck, Sparkles, Award } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import EvaluationCard from '../components/EvaluationCard'
import { getAllStoredEvaluations } from '../services/evaluationStore'
import type { Evaluation } from '../types/models'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recentEvaluations, setRecentEvaluations] = useState<Evaluation[]>(() => {
    const local = getAllStoredEvaluations()
    return local.slice(0, 5)
  })
  const [totalCount, setTotalCount] = useState<number>(() => {
    const local = getAllStoredEvaluations()
    return local.length || 3
  })
  const [syncedCount, setSyncedCount] = useState<number>(() => {
    const local = getAllStoredEvaluations()
    return local.filter((e) => e.status === 'synced').length || 2
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get<{ data: Evaluation[]; pagination: { total: number } }>('/evaluations?limit=5')
      .then((res) => {
        if (!active) return
        const evals = res.data.data ?? []
        if (evals.length > 0) {
          setRecentEvaluations(evals)
          setTotalCount(res.data.pagination?.total ?? evals.length)
          const synced = evals.filter(
            (e) => e.status === 'synced' || e.bpa_sync?.some((s) => s.status === 'synced'),
          ).length
          setSyncedCount(synced)
        }
      })
      .catch((err) => {
        console.warn('Using local evaluations store for dashboard:', err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60 mb-1">
            <Sparkles size={11} className="text-emerald-600" />
            <span>Rashtriya Gokul Mission</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Hello, {user?.name || 'Field Typer'}
          </h1>
          <p className="text-xs font-semibold text-slate-500">
            Official Bovine Type Classification & Phenotype Recording
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200">
          <ShieldCheck size={26} />
        </div>
      </div>

      {/* Main Call to Action: Start New Scan */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 p-6 sm:p-7 text-white shadow-xl shadow-emerald-950/20">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-300">
            <Award size={13} className="text-emerald-400" />
            <span>AI Automated Assessment</span>
          </span>
          <h2 className="text-xl sm:text-2xl font-black leading-tight tracking-tight">Ready to score livestock?</h2>
          <p className="text-xs font-semibold text-slate-300 max-w-sm">
            Capture side profile, extract keypoints, compute linear classification 1-9 scores with ArUco millimeter accuracy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="mt-6 flex min-h-touch w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-500/30 transition active:scale-[0.99] hover:bg-emerald-400"
        >
          <ScanLine size={20} />
          <span>Start Animal Evaluation</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border-2 border-slate-200/90 bg-white p-3.5 text-center shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Evaluations</span>
          <p className="mt-1 text-2xl font-black text-slate-900">{totalCount}</p>
        </div>
        <div className="rounded-2xl border-2 border-slate-200/90 bg-white p-3.5 text-center shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">BPA Synced</span>
          <p className="mt-1 text-2xl font-black text-emerald-700">{syncedCount}</p>
        </div>
        <div className="rounded-2xl border-2 border-slate-200/90 bg-white p-3.5 text-center shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">Pending</span>
          <p className="mt-1 text-2xl font-black text-amber-700">
            {Math.max(0, totalCount - syncedCount)}
          </p>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="flex min-h-touch items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left font-black text-slate-800 shadow-sm hover:border-emerald-600 active:scale-[0.98] transition"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <PlusCircle size={22} />
          </div>
          <div className="text-xs leading-tight">
            <span className="font-black text-slate-900 text-sm block">Register</span>
            <span className="text-slate-500 font-semibold">New Bovine</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/evaluations')}
          className="flex min-h-touch items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left font-black text-slate-800 shadow-sm hover:border-emerald-600 active:scale-[0.98] transition"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <History size={22} />
          </div>
          <div className="text-xs leading-tight">
            <span className="font-black text-slate-900 text-sm block">Records</span>
            <span className="text-slate-500 font-semibold">History & Sync</span>
          </div>
        </button>
      </div>

      {/* Recent Evaluations Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
            Recent Records
          </h2>
          <button
            type="button"
            onClick={() => navigate('/evaluations')}
            className="flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-800"
          >
            <span>View All</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {recentEvaluations.length === 0 && !loading ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
            <p className="text-xs font-bold text-slate-500">No evaluations yet.</p>
            <button
              type="button"
              onClick={() => navigate('/animals/new')}
              className="mt-3 inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:underline"
            >
              Start your first animal scan
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentEvaluations.map((ev) => (
              <EvaluationCard
                key={ev.id}
                evaluation={ev}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
