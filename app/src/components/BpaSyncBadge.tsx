import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import type { BpaSyncStatus } from '../types/models'

interface BpaSyncBadgeProps {
  status?: BpaSyncStatus | string | null
  referenceId?: string | null
  className?: string
}

export default function BpaSyncBadge({ status, referenceId, className = '' }: BpaSyncBadgeProps) {
  const normStatus = (status ?? 'pending').toLowerCase()

  if (normStatus === 'synced') {
    return (
      <span
        title={referenceId ? `Ref: ${referenceId}` : 'Synced with BPA'}
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 ${className}`}
      >
        <CheckCircle2 size={13} className="shrink-0 text-emerald-700" />
        <span>BPA Synced</span>
      </span>
    )
  }

  if (normStatus === 'failed') {
    return (
      <span
        title="BPA synchronization failed"
        className={`inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-extrabold text-rose-800 ${className}`}
      >
        <AlertCircle size={13} className="shrink-0 text-rose-700" />
        <span>Sync Failed</span>
      </span>
    )
  }

  return (
    <span
      title="Pending BPA synchronization"
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-800 ${className}`}
    >
      <Clock size={13} className="shrink-0 text-amber-700" />
      <span>Pending BPA</span>
    </span>
  )
}
