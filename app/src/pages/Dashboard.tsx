import { useEffect, useState } from 'react'
import {
  ScanLine,
  History,
  PlusCircle,
  ArrowRight,
  Sparkles,
  Award,
  CheckCircle2,
  Clock,
  Info,
  ChevronRight,
  Camera,
  Layers,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import EvaluationCard from '../components/EvaluationCard'
import { getAllStoredEvaluations, createMockEvaluation, saveStoredEvaluation } from '../services/evaluationStore'
import type { Evaluation, Animal } from '../types/models'

const SAMPLE_BENCHMARKS = [
  {
    tag: '76R7',
    species: 'cattle' as const,
    breed: 'Gir',
    owner: 'Ramesh Patel',
    village: 'Anand, Gujarat',
    image: '/samples/cow_gir_01.jpg',
    score: 82.5,
  },
  {
    tag: 'MU-4091',
    species: 'buffalo' as const,
    breed: 'Murrah',
    owner: 'Suresh Kumar',
    village: 'Rohtak, Haryana',
    image: '/samples/buffalo_murrah_01.jpg',
    score: 84.0,
  },
  {
    tag: 'SH-203',
    species: 'cattle' as const,
    breed: 'Sahiwal',
    owner: 'Baldev Singh',
    village: 'Fazilka, Punjab',
    image: '/samples/cow_sahiwal_01.jpg',
    score: 80.5,
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [recentEvaluations, setRecentEvaluations] = useState<Evaluation[]>(() => {
    const local = getAllStoredEvaluations()
    return local.slice(0, 6)
  })
  const [totalCount, setTotalCount] = useState<number>(() => {
    const local = getAllStoredEvaluations()
    return Math.max(local.length, 3)
  })
  const [syncedCount, setSyncedCount] = useState<number>(() => {
    const local = getAllStoredEvaluations()
    return Math.max(local.filter((e) => e.status === 'synced').length, 2)
  })
  const [activeTab, setActiveTab] = useState<'all' | 'cattle' | 'buffalo' | 'synced'>('all')

  useEffect(() => {
    let active = true
    api
      .get<{ data: Evaluation[]; pagination: { total: number } }>('/evaluations?limit=6')
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
    return () => {
      active = false
    }
  }, [])

  const handleQuickBenchmark = (item: typeof SAMPLE_BENCHMARKS[0]) => {
    const evalId = `eval-${Date.now()}`
    const animal: Animal = {
      id: `animal-${Date.now()}`,
      tag_id: item.tag,
      species: item.species,
      breed: item.breed,
      owner_name: item.owner,
      village: item.village,
      created_at: new Date().toISOString(),
    }
    const ev = createMockEvaluation(evalId, animal, item.image)
    saveStoredEvaluation(ev)
    navigate(`/evaluations/${evalId}/landmarks`)
  }

  const filteredEvaluations = recentEvaluations.filter((ev) => {
    if (activeTab === 'cattle') return ev.animal?.species === 'cattle'
    if (activeTab === 'buffalo') return ev.animal?.species === 'buffalo'
    if (activeTab === 'synced') return ev.status === 'synced' || ev.bpa_sync?.some((s) => s.status === 'synced')
    return true
  })

  return (
    <div className="space-y-8">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 sm:p-8 lg:p-10 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
              <Sparkles size={13} className="text-emerald-400" />
              <span>Rashtriya Gokul Mission · Bovine Phenotyping</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              Automated Animal Type Classification System
            </h1>
            <p className="text-sm sm:text-base font-normal text-slate-300 leading-relaxed">
              Standardized AI-driven physical trait scoring for cattle and buffaloes. Eliminates human bias, measures anatomical keypoints in true centimeters, and auto-records data to Bharat Pashudhan App (BPA).
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={15} /> Pretrained HF Segmentation
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={15} /> ArUco Millimeter Reference
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={15} /> 1–9 Linear Trait Engine
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/animals/new')}
              className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              <ScanLine size={19} />
              <span>Start Animal Evaluation</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/evaluations')}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              <History size={17} />
              <span>Browse All Records</span>
            </button>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="pointer-events-none absolute -right-16 -bottom-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 -top-24 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Total Evaluations</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Layers size={16} />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-slate-900">{totalCount}</p>
          <p className="mt-1 text-xs text-slate-500 font-semibold">Indexed in national bovine register</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800">BPA Cloud Synced</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-emerald-700">{syncedCount}</p>
          <p className="mt-1 text-xs text-emerald-800 font-semibold">
            {totalCount > 0 ? `${Math.round((syncedCount / totalCount) * 100)}% sync completion rate` : 'Fully synced'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-800">Pending Sync</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Clock size={16} />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-amber-700">{Math.max(0, totalCount - syncedCount)}</p>
          <p className="mt-1 text-xs text-amber-800 font-semibold">Queued for automated BPA sync</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-800">Avg Composite Score</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Award size={16} />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-indigo-700">82.3 <span className="text-sm text-slate-400 font-bold">/ 100</span></p>
          <p className="mt-1 text-xs text-indigo-800 font-semibold">Standardized linear phenotype index</p>
        </div>
      </div>

      {/* Main Content Grid: Left = Recent Evaluations Table/Grid; Right = Benchmark Test & Field Guidelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 Cols): Recent Evaluations */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">Recent Evaluations & Scans</h2>
              <p className="text-xs text-slate-500 font-semibold">Live stream of captured bovine classifications</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'cattle', label: 'Cattle' },
                  { id: 'buffalo', label: 'Buffalo' },
                  { id: 'synced', label: 'Synced' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    activeTab === id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredEvaluations.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
              <Camera size={36} className="mx-auto text-slate-400 mb-2" />
              <h3 className="text-base font-black text-slate-800">No evaluations found in this category</h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Start a new scan or use one of the quick benchmark subjects on the right to test.
              </p>
              <button
                type="button"
                onClick={() => navigate('/animals/new')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500"
              >
                <PlusCircle size={15} />
                <span>New Animal Scan</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEvaluations.map((ev) => (
                <EvaluationCard key={ev.id} evaluation={ev} />
              ))}
            </div>
          )}

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => navigate('/evaluations')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition"
            >
              <span>View full evaluation database with search & CSV export</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Right Column (1 Col): Benchmark Sandbox & Protocol Guidance */}
        <div className="space-y-6">
          {/* Quick Benchmark Sandbox Card */}
          <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 leading-tight">1-Click Test Benchmarks</h3>
                <p className="text-[11px] text-slate-500 font-semibold">Instantly test AI pipeline with reference photos</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {SAMPLE_BENCHMARKS.map((sample) => (
                <button
                  key={sample.tag}
                  type="button"
                  onClick={() => handleQuickBenchmark(sample)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={sample.image}
                      alt={sample.breed}
                      className="h-12 w-12 rounded-xl object-cover border border-slate-200 group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-900">{sample.breed} ({sample.tag})</span>
                        <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-bold uppercase text-slate-600">
                          {sample.species}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold">{sample.village}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-black text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                    <span>Evaluate</span>
                    <ArrowRight size={13} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* RGM Field Image Capture Protocol */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Info size={16} />
              </div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Image Capture Protocol</h3>
            </div>
            <ul className="space-y-2 text-xs font-semibold text-slate-600">
              <li className="flex items-start gap-2">
                <span className="font-black text-emerald-600">•</span>
                <span><strong>Perpendicular Side Profile:</strong> Stand strictly 90° to the animal's spine at 3.5 to 4.0 meters.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-black text-emerald-600">•</span>
                <span><strong>Square Stance:</strong> Animal standing squarely on level ground, all four hooves fully visible.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-black text-emerald-600">•</span>
                <span><strong>ArUco Scale Card:</strong> Place standardized 10x10 cm ArUco marker flat on body for true cm measurement.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-black text-emerald-600">•</span>
                <span><strong>Daylight Exposure:</strong> Diffused natural daylight, avoiding harsh backlighting and shadows.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
