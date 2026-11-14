import { useNavigate } from 'react-router-dom'
import { ChevronRight, Calendar, MapPin } from 'lucide-react'
import BpaSyncBadge from './BpaSyncBadge'
import type { Evaluation } from '../types/models'

interface EvaluationCardProps {
  evaluation: Evaluation
}

export default function EvaluationCard({ evaluation }: EvaluationCardProps) {
  const navigate = useNavigate()

  const formattedDate = new Date(evaluation.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  // Get most recent BPA sync status
  const latestSync = evaluation.bpa_sync && evaluation.bpa_sync.length > 0 ? evaluation.bpa_sync[0] : null
  const syncStatus = latestSync?.status ?? (evaluation.status === 'synced' ? 'synced' : 'pending')

  const isAnalyzed = evaluation.status === 'analyzed' || evaluation.status === 'confirmed' || evaluation.status === 'synced'
  const targetRoute = isAnalyzed
    ? `/evaluations/${evaluation.id}/review`
    : `/evaluations/${evaluation.id}/adjust`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(targetRoute)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          navigate(targetRoute)
        }
      }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-400 hover:shadow-md active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-black tracking-tight text-slate-900">
              #{evaluation.animal?.tag_id || 'UNKNOWN'}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 uppercase">
              {evaluation.animal?.breed || evaluation.animal?.species || 'Cattle'}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar size={13} />
              {formattedDate}
            </span>
            {evaluation.animal?.village && (
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                {evaluation.animal.village}
              </span>
            )}
          </div>
        </div>

        {/* Overall Score Badge */}
        {evaluation.overall_score !== null && evaluation.overall_score !== undefined ? (
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-0.5 rounded-xl bg-brand-50 px-2.5 py-1 border border-brand-200">
              <span className="text-xl font-black text-brand-700">
                {Math.round(evaluation.overall_score * 10) / 10}
              </span>
              <span className="text-[10px] font-bold text-brand-600">/100</span>
            </div>
            <span className="mt-0.5 text-[10px] font-bold text-slate-400 uppercase">Type Score</span>
          </div>
        ) : (
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            {evaluation.status}
          </span>
        )}
      </div>

      {/* Footer bar with BPA status & quick tap */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
        <BpaSyncBadge status={syncStatus} referenceId={latestSync?.bpa_reference_id} />
        <span className="flex items-center gap-0.5 font-bold text-brand-700 group-hover:translate-x-1 transition-transform">
          View details
          <ChevronRight size={15} />
        </span>
      </div>
    </div>
  )
}
