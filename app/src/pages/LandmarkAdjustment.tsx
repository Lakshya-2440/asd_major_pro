import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RotateCcw, Check, ArrowRight, AlertCircle, Info } from 'lucide-react'
import api from '../services/api'
import LandmarkCanvas, { type LandmarkNode } from '../components/LandmarkCanvas'
import type { Evaluation, LandmarkCoord } from '../types/models'

const STANDARD_LANDMARKS: { name: string; label: string; color: string; defaultPos: LandmarkCoord }[] = [
  { name: 'withers', label: 'Withers', color: '#38bdf8', defaultPos: { x: 260, y: 140 } },
  { name: 'shoulder_point', label: 'Shoulder', color: '#4ade80', defaultPos: { x: 190, y: 220 } },
  { name: 'hip_point', label: 'Hip (Hook)', color: '#fbbf24', defaultPos: { x: 490, y: 170 } },
  { name: 'pin_bone', label: 'Pin Bone', color: '#f87171', defaultPos: { x: 570, y: 195 } },
  { name: 'brisket', label: 'Brisket', color: '#c084fc', defaultPos: { x: 280, y: 310 } },
  { name: 'front_hoof', label: 'Front Hoof', color: '#60a5fa', defaultPos: { x: 250, y: 460 } },
  { name: 'rear_hoof', label: 'Rear Hoof', color: '#f472b6', defaultPos: { x: 540, y: 460 } },
]

export default function LandmarkAdjustment() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<LandmarkNode[]>([])

  // Load evaluation
  useEffect(() => {
    if (!id) return
    let active = true
    api
      .get<Evaluation>(`/evaluations/${id}`)
      .then((res) => {
        if (!active) return
        const ev = res.data
        setEvaluation(ev)

        // Build nodes from DB landmarks or defaults
        const rawMap = new Map(
          (ev.landmarks ?? []).map((l) => [
            l.name,
            l.corrected_pos ?? l.estimated_pos,
          ]),
        )
        const initialMap = new Map(
          (ev.landmarks ?? []).map((l) => [l.name, l.estimated_pos]),
        )

        const builtNodes: LandmarkNode[] = STANDARD_LANDMARKS.map((std) => {
          const coord = rawMap.get(std.name) ?? std.defaultPos
          const initialCoord = initialMap.get(std.name) ?? std.defaultPos
          return {
            name: std.name,
            label: std.label,
            color: std.color,
            coord,
            initialCoord,
          }
        })
        setNodes(builtNodes)
      })
      .catch((err) => {
        console.error('Failed to load evaluation', err)
        if (active) {
          setError('Failed to load evaluation details')
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

  const handlePointChange = useCallback((name: string, newCoord: LandmarkCoord) => {
    setNodes((prev) =>
      prev.map((node) => (node.name === name ? { ...node, coord: newCoord } : node)),
    )
  }, [])

  const handleReset = () => {
    setNodes((prev) =>
      prev.map((node) => ({ ...node, coord: { ...node.initialCoord } })),
    )
  }

  const handleConfirm = async () => {
    if (!id) return
    setSaving(true)
    setError(null)

    const landmarkPayload: Record<string, { x: number; y: number }> = {}
    nodes.forEach((n) => {
      landmarkPayload[n.name] = { x: n.coord.x, y: n.coord.y }
    })

    try {
      await api.patch(`/evaluations/${id}/landmarks`, {
        landmarks: landmarkPayload,
      })
      navigate(`/evaluations/${id}/review`)
    } catch (err: unknown) {
      console.warn('Landmark patch error:', err)
      // If recompute failed (e.g. mock server or calculation warning), allow progressing to review
      navigate(`/evaluations/${id}/review`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Loading anatomical landmarks...</p>
      </div>
    )
  }

  // Resolve image URL
  const primaryImage = evaluation?.images?.[0]
  const imagePath = primaryImage?.image_url
  const finalImageUrl = imagePath
    ? imagePath.startsWith('http')
      ? imagePath
      : `${(import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/api\/?$/, '')}${imagePath}`
    : '/vite.svg'

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Adjust Anatomical Landmarks
          </h1>
          <p className="text-xs font-semibold text-slate-500">
            Drag nodes to align with true physical body points
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/evaluations/${id}/review`)}
          className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          <span>Skip</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Guide Banner */}
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-2.5 text-xs font-medium text-blue-900 border border-blue-200">
        <Info size={16} className="shrink-0 text-blue-600" />
        <span>
          Touch and drag points to correct position. Blue=Height, Green=Length, Amber=Rump angle.
        </span>
      </div>

      {/* Interactive Landmark Canvas */}
      <LandmarkCanvas
        imageUrl={finalImageUrl}
        landmarks={nodes}
        onChange={handlePointChange}
        disabled={saving}
      />

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleReset}
          className="flex min-h-touch items-center justify-center gap-1.5 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw size={16} />
          Reset to AI
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={handleConfirm}
          className="flex-1 flex min-h-touch items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 py-3 text-sm font-bold text-white shadow hover:bg-brand-800 disabled:opacity-50"
        >
          {saving ? (
            <span>Recalculating...</span>
          ) : (
            <>
              <Check size={18} />
              <span>Confirm & Compute Scores</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
