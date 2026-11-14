import { useState, type FormEvent } from 'react'
import { AlertCircle, Check, X } from 'lucide-react'

interface ScoreOverrideModalProps {
  isOpen: boolean
  traitName: string
  currentAiScore: number
  currentFinalScore: number
  currentReason?: string | null
  onClose: () => void
  onSave: (finalScore: number, reason: string) => Promise<void>
}

export default function ScoreOverrideModal({
  isOpen,
  traitName,
  currentAiScore,
  currentFinalScore,
  currentReason,
  onClose,
  onSave,
}: ScoreOverrideModalProps) {
  const [score, setScore] = useState<number>(currentFinalScore ?? currentAiScore ?? 5)
  const [reason, setReason] = useState<string>(currentReason ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (reason.trim().length < 5) {
      setError('Reason for override must be at least 5 characters')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSave(score, reason.trim())
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update score override'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const formatTraitName = (name: string) => {
    return name
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Override Trait Score</h3>
            <p className="text-xs font-semibold text-brand-700">{formatTraitName(traitName)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* AI vs Overridden Score Info */}
          <div className="flex items-center justify-between rounded-xl bg-slate-100 p-3 text-sm">
            <div>
              <span className="text-xs font-medium text-slate-500">AI Suggested</span>
              <p className="text-lg font-black text-slate-700">{currentAiScore} / 9</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-brand-800">Your New Score</span>
              <p className="text-2xl font-black text-brand-700">{score} / 9</p>
            </div>
          </div>

          {/* 1-9 Linear Score Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Linear Classification Score (1 - 9)
            </label>
            <div className="grid grid-cols-9 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setScore(val)}
                  className={`min-h-[44px] rounded-lg font-bold text-sm transition-all ${
                    score === val
                      ? 'bg-brand-700 text-white shadow-md scale-105'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Override Reason Required Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Reason for Override <span className="text-red-500">* (min 5 chars)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Animal stood on uneven slope, shadow obscured brisket"
              className="w-full rounded-xl border-2 border-slate-300 p-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
              required
              minLength={5}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 5}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 py-2.5 text-sm font-bold text-white shadow hover:bg-brand-800 disabled:opacity-50"
            >
              {submitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>Save Override</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
