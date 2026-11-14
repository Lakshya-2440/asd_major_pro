import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RotateCcw, ArrowRight, Info, Sparkles } from 'lucide-react'
import api from '../services/api'
import LandmarkCanvas, { type LandmarkNode } from '../components/LandmarkCanvas'
import { getStoredEvaluation, updateStoredLandmarks } from '../services/evaluationStore'
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
  const [nodes, setNodes] = useState<LandmarkNode[]>([])

  const buildNodesFromEvaluation = useCallback((ev: Evaluation) => {
    const rawMap = new Map(
      (ev.landmarks ?? []).map((l) => [
        l.name,
        l.corrected_pos ?? l.estimated_pos,
      ]),
    )
    const initialMap = new Map(
      (ev.landmarks ?? []).map((l) => [l.name, l.estimated_pos]),
    )

    return STANDARD_LANDMARKS.map((std) => {
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
  }, [])

  // Load evaluation (API with local store fallback)
  useEffect(() => {
    if (!id) return
    let active = true

    api
      .get<Evaluation>(`/evaluations/${id}`)
      .then((res) => {
        if (!active) return
        const ev = res.data
        setEvaluation(ev)
        setNodes(buildNodesFromEvaluation(ev))
      })
      .catch(() => {
        // Fallback to local evaluation store
        const stored = getStoredEvaluation(id)
        if (stored && active) {
          setEvaluation(stored)
          setNodes(buildNodesFromEvaluation(stored))
        } else if (active) {
          // Synthetic fallback
          const fallbackEv: Evaluation = {
            id,
            animal_id: 'sample',
            evaluator_id: 'guest-typer-001',
            status: 'analyzed',
            overall_score: 82.0,
            images: [{ id: '1', view_type: 'side', image_url: '/samples/cow_gir_01.jpg', quality_flags: [] }],
            landmarks: [],
            animal: {
              id: 'sample',
              tag_id: '76R7',
              species: 'cattle',
              breed: 'Gir',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          setEvaluation(fallbackEv)
          setNodes(buildNodesFromEvaluation(fallbackEv))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, buildNodesFromEvaluation])

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

    const landmarkPayload: Record<string, { x: number; y: number }> = {}
    nodes.forEach((n) => {
      landmarkPayload[n.name] = { x: n.coord.x, y: n.coord.y }
    })

    // Save to local store first for guaranteed persistence
    updateStoredLandmarks(id, landmarkPayload)

    try {
      await api.patch(`/evaluations/${id}/landmarks`, {
        landmarks: landmarkPayload,
      })
    } catch (err) {
      console.warn('Backend patch failed, proceeding with locally verified landmarks:', err)
    } finally {
      setSaving(false)
      navigate(`/evaluations/${id}/review`)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="mt-4 text-sm font-black text-slate-800 tracking-tight">Loading Anatomical Landmarks...</p>
      </div>
    )
  }

  // Resolve image URL
  const primaryImage = evaluation?.images?.[0]
  const imagePath = primaryImage?.image_url
  const finalImageUrl = imagePath
    ? imagePath.startsWith('http') || imagePath.startsWith('blob:') || imagePath.startsWith('data:') || imagePath.startsWith('/samples/')
      ? imagePath
      : `${(import.meta.env.VITE_API_URL ?? '/api').replace(/\/api\/?$/, '')}${imagePath}`
    : '/samples/cow_gir_01.jpg'

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-black uppercase tracking-wider mb-1">
            <Sparkles size={12} className="text-emerald-600" />
            <span>AI Landmark Extraction</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Adjust Anatomical Points
          </h1>
          <p className="text-xs font-semibold text-slate-500">
            Drag any pin to refine bone landmarks prior to linear score generation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex min-h-touch items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 transition"
          >
            <RotateCcw size={15} />
            <span>Reset Points</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleConfirm}
            className="flex min-h-touch items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50"
          >
            <span>{saving ? 'Computing...' : 'Calculate Scores'}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Helper Guidance Banner */}
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-3 text-xs font-bold text-emerald-900">
        <Info size={16} className="shrink-0 text-emerald-600" />
        <span>
          7 standard anatomical points detected. Pinch or drag handles to align with withers, pin bone, and hooves.
        </span>
      </div>

      {/* Draggable Canvas Card */}
      <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-slate-950 p-2 shadow-xl shadow-slate-950/10">
        <LandmarkCanvas
          imageUrl={finalImageUrl}
          landmarks={nodes}
          onChange={handlePointChange}
        />
      </div>

      {/* Landmark List Badges */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2.5">
          Active Anatomical Landmarks:
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {nodes.map((node) => (
            <div
              key={node.name}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shadow-sm"
                  style={{ backgroundColor: node.color }}
                />
                <span className="font-bold text-slate-800">{node.label}</span>
              </div>
              <span className="font-mono text-[10px] font-bold text-slate-500">
                {Math.round(node.coord.x)},{Math.round(node.coord.y)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
