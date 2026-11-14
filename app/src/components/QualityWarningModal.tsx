import { AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react'

interface QualityWarningModalProps {
  isOpen: boolean
  flags: string[]
  onRetake: () => void
  onProceedAnyway: () => void
}

const FLAG_TIPS: Record<string, { label: string; tip: string }> = {
  blurry: {
    label: 'Image is Blurry',
    tip: 'Hold phone steady, ensure camera lens is clean, and tap on the animal body to focus before capturing.',
  },
  too_dark: {
    label: 'Under-exposed / Too Dark',
    tip: 'Move to an open, well-lit field or face the sunlight towards the animal.',
  },
  too_bright: {
    label: 'Over-exposed / Harsh Glare',
    tip: 'Avoid shooting directly into the midday sun or move the animal to even shade.',
  },
  marker_missing: {
    label: 'Reference Marker Missing',
    tip: 'Ensure the ArUco 10cm calibration marker is placed flat on the ground beside the animal.',
  },
  wrong_orientation: {
    label: 'Incorrect Orientation',
    tip: 'Hold your device in landscape or portrait aligned with the side-profile guide.',
  },
  low_resolution: {
    label: 'Low Image Resolution',
    tip: 'Move closer to the animal so it occupies at least 70% of the camera frame.',
  },
}

export default function QualityWarningModal({
  isOpen,
  flags,
  onRetake,
  onProceedAnyway,
}: QualityWarningModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-amber-500 p-4 text-white">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-white" />
            <h2 className="text-lg font-bold">Image Quality Warning</h2>
          </div>
          <p className="mt-1 text-xs text-amber-50">
            Issues detected that may reduce measurement accuracy
          </p>
        </div>

        <div className="p-4">
          <ul className="space-y-3">
            {flags.map((flag) => {
              const details = FLAG_TIPS[flag] ?? {
                label: `Issue: ${flag}`,
                tip: 'Please inspect the image quality to ensure accurate landmark identification.',
              }
              return (
                <li key={flag} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm">
                  <div className="font-bold text-amber-900">{details.label}</div>
                  <p className="mt-0.5 text-xs text-amber-800">{details.tip}</p>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onRetake}
              className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-brand-800 active:bg-brand-900"
            >
              <RefreshCw size={18} />
              Retake Photo (Recommended)
            </button>
            <button
              type="button"
              onClick={onProceedAnyway}
              className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Proceed Anyway
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
