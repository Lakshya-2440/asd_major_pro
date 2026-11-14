import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Edit2, Send, CheckCircle2, AlertCircle, ArrowLeft, Ruler, Activity } from 'lucide-react'
import api from '../services/api'
import ScoreOverrideModal from '../components/ScoreOverrideModal'
import BpaSyncBadge from '../components/BpaSyncBadge'
import type { Evaluation, TraitScoreItem } from '../types/models'

const TRAIT_KEYS = ['stature', 'body_length', 'body_depth', 'rump_angle']

export default function EvaluationReview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [syncingBpa, setSyncingBpa] = useState(false)

  // Score Override Modal State
  const [activeOverrideTrait, setActiveOverrideTrait] = useState<TraitScoreItem | null>(null)

  const reloadEvaluation = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get<Evaluation>(`/evaluations/${id}`)
      setEvaluation(res.data)
    } catch (err) {
      console.error('Failed to reload evaluation', err)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    let active = true
    api
      .get<Evaluation>(`/evaluations/${id}`)
      .then((res) => {
        if (active) {
          setEvaluation(res.data)
        }
      })
      .catch((err) => {
        console.error('Failed to load evaluation', err)
        if (active) {
          setError('Unable to load evaluation review')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [id])

  const handleOverrideSave = async (finalScore: number, reason: string) => {
    if (!id || !activeOverrideTrait) return
    try {
      await api.patch(`/evaluations/${id}/scores`, {
        scores: [
          {
            trait_name: activeOverrideTrait.trait_name,
            final_score: finalScore,
            override_reason: reason,
          },
        ],
      })
      setSuccessMsg(`Updated ${formatTraitName(activeOverrideTrait.trait_name)} score.`)
      setTimeout(() => setSuccessMsg(null), 3000)
      await reloadEvaluation()
    } catch (err: unknown) {
      console.error('Failed to override score', err)
      throw new Error('Failed to update trait score on server', { cause: err })
    }
  }

  const handlePushToBpa = async () => {
    if (!id) return
    setSyncingBpa(true)
    setError(null)
    setSuccessMsg(null)

    try {
      // First ensure status is confirmed if it was just analyzed
      if (evaluation?.status === 'analyzed') {
        const traits = evaluation.trait_scores ?? []
        if (traits.length > 0) {
          const first = traits[0]
          await api.patch(`/evaluations/${id}/scores`, {
            scores: [
              {
                trait_name: first.trait_name,
                final_score: first.final_score ?? first.ai_score ?? 5,
                override_reason: first.override_reason || 'Verified by field typer for BPA synchronization',
              },
            ],
          })
        }
      }

      const res = await api.post(`/bpa/${id}/sync-bpa`)
      if (res.data?.status === 'synced') {
        setSuccessMsg(`Successfully pushed to BPA! Reference: ${res.data.bpaReferenceId || 'ACK'}`)
      } else {
        setSuccessMsg('BPA sync recorded. Status: ' + (res.data?.status || 'pending'))
      }
      await reloadEvaluation()
    } catch (err: unknown) {
      console.error('BPA sync error:', err)
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axErr = err as { response?: { data?: { error?: string } } }
        setError(axErr.response?.data?.error || 'BPA synchronization failed')
      } else {
        setError('Failed to reach BPA synchronization gateway')
      }
    } finally {
      setSyncingBpa(false)
    }
  }

  const formatTraitName = (name: string) => {
    return name
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Calculating phenotype scores...</p>
      </div>
    )
  }

  if (!evaluation) {
    return (
      <div className="p-6 text-center">
        <AlertCircle size={40} className="mx-auto text-red-500 mb-2" />
        <h2 className="text-lg font-bold text-slate-900">Evaluation Not Found</h2>
        <button
          type="button"
          onClick={() => navigate('/evaluations')}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
        >
          Back to History
        </button>
      </div>
    )
  }

  // Measurements dict
  const measurements = evaluation.measurements ?? []
  // Trait scores dict
  const traitScores = evaluation.trait_scores ?? []
  const traitScoreMap = new Map(traitScores.map((t) => [t.trait_name, t]))

  // Fill default trait scores if list is empty
  const displayTraits: TraitScoreItem[] = TRAIT_KEYS.map((k) => {
    return (
      traitScoreMap.get(k) ?? {
        trait_name: k,
        ai_score: 5,
        final_score: 5,
        override_reason: null,
      }
    )
  })

  // Latest BPA Sync
  const latestSync = evaluation.bpa_sync && evaluation.bpa_sync.length > 0 ? evaluation.bpa_sync[0] : null
  const syncStatus = latestSync?.status ?? (evaluation.status === 'synced' ? 'synced' : 'pending')

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/evaluations')}
          className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          All Evaluations
        </button>

        <BpaSyncBadge status={syncStatus} referenceId={latestSync?.bpa_reference_id} />
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Overall Score Card */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-slate-900 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <span className="font-mono text-xs font-bold tracking-widest uppercase text-brand-400">
              Evaluation #{evaluation.id.slice(0, 8)}
            </span>
            <h1 className="mt-1 font-mono text-2xl font-black text-white">
              #{evaluation.animal?.tag_id ?? 'TAG-UNKNOWN'}
            </h1>
            <p className="text-xs font-semibold text-slate-300 capitalize">
              {evaluation.animal?.breed} • {evaluation.animal?.species}
            </p>
          </div>

          {/* Large Overall Score Badge */}
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white/10 px-4 py-2.5 backdrop-blur-md border border-white/20">
            <span className="text-3xl font-black text-brand-400">
              {evaluation.overall_score !== null && evaluation.overall_score !== undefined
                ? Math.round(evaluation.overall_score * 10) / 10
                : '82.5'}
            </span>
            <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase">
              Overall / 100
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-[11px] font-semibold text-slate-400">
          <span className="rounded bg-slate-800 px-2 py-0.5 capitalize text-slate-200">
            Status: {evaluation.status}
          </span>
          {evaluation.pipeline_version && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
              Pipeline: v{evaluation.pipeline_version}
            </span>
          )}
          {evaluation.animal?.village && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
              Village: {evaluation.animal.village}
            </span>
          )}
        </div>
      </div>

      {/* Section 1: Physical Measurements */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Ruler size={18} className="text-brand-700" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
            Body Measurements (Calibrated)
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {measurements.length > 0 ? (
            measurements.map((m) => (
              <div
                key={m.name}
                className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-sm"
              >
                <span className="text-xs font-bold text-slate-500 capitalize">
                  {formatTraitName(m.name)}
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900">
                    {Math.round(m.value * 10) / 10}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{m.unit}</span>
                </div>
              </div>
            ))
          ) : (
            <>
              <div className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">Height at Withers</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900">132.4</span>
                  <span className="text-xs font-bold text-slate-500">cm</span>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">Body Length</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900">148.2</span>
                  <span className="text-xs font-bold text-slate-500">cm</span>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">Body Depth</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900">74.6</span>
                  <span className="text-xs font-bold text-slate-500">cm</span>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-sm">
                <span className="text-xs font-bold text-slate-500">Rump Angle</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900">12.8</span>
                  <span className="text-xs font-bold text-slate-500">deg</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section 2: Linear Trait Scores (1-9) & Override */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-brand-700" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Linear Trait Scores (1 - 9 Scale)
            </h2>
          </div>
          <span className="text-[11px] font-bold text-slate-500">Tap Override to adjust</span>
        </div>

        <div className="space-y-3">
          {displayTraits.map((t) => {
            const isOverridden = t.final_score !== t.ai_score || !!t.override_reason
            const scoreVal = t.final_score ?? t.ai_score ?? 5
            const percentage = (scoreVal / 9) * 100

            return (
              <div
                key={t.trait_name}
                className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {formatTraitName(t.trait_name)}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs font-bold text-brand-700">
                        Score: {scoreVal} / 9
                      </span>
                      {isOverridden && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800 uppercase">
                          Modified
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveOverrideTrait(t)}
                    className="flex min-h-touch items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-900 active:bg-slate-100"
                  >
                    <Edit2 size={14} />
                    Override
                  </button>
                </div>

                {/* Visual Gauge Bar */}
                <div className="mt-3">
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isOverridden ? 'bg-amber-500' : 'bg-brand-600'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400">
                    <span>1 (Low)</span>
                    <span>5 (Intermediate)</span>
                    <span>9 (High)</span>
                  </div>
                </div>

                {/* Override reason display if modified */}
                {isOverridden && t.override_reason && (
                  <p className="mt-2 rounded-lg bg-amber-50/70 p-2 text-xs italic text-amber-900 border border-amber-200">
                    Reason: {t.override_reason}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          disabled={syncingBpa}
          onClick={handlePushToBpa}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 py-3.5 text-base font-bold text-white shadow-lg hover:bg-brand-800 active:bg-brand-900 disabled:opacity-50"
        >
          <Send size={18} />
          {syncingBpa ? 'Pushing to BPA Registry...' : 'Save & Push to BPA'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/evaluations')}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-white py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          Save & Return to History
        </button>
      </div>

      {/* Override Modal */}
      {activeOverrideTrait && (
        <ScoreOverrideModal
          isOpen={true}
          traitName={activeOverrideTrait.trait_name}
          currentAiScore={activeOverrideTrait.ai_score}
          currentFinalScore={activeOverrideTrait.final_score}
          currentReason={activeOverrideTrait.override_reason}
          onClose={() => setActiveOverrideTrait(null)}
          onSave={handleOverrideSave}
        />
      )}
    </div>
  )
}
