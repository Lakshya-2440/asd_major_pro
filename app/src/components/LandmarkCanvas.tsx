import { useRef, useState, useCallback, type SyntheticEvent, type PointerEvent } from 'react'
import type { LandmarkCoord } from '../types/models'

export interface LandmarkNode {
  name: string
  label: string
  color: string
  coord: LandmarkCoord
  initialCoord: LandmarkCoord
}

interface LandmarkCanvasProps {
  imageUrl: string
  landmarks: LandmarkNode[]
  onChange: (name: string, newCoord: LandmarkCoord) => void
  disabled?: boolean
}

// Anatomical connection definitions
const CONNECTIONS: [string, string, string, string][] = [
  // [landmarkA, landmarkB, label, color]
  ['withers', 'front_hoof', 'Height', '#3b82f6'],
  ['shoulder_point', 'pin_bone', 'Body Length', '#10b981'],
  ['hip_point', 'pin_bone', 'Rump Angle', '#f59e0b'],
  ['withers', 'brisket', 'Body Depth', '#8b5cf6'],
]

export default function LandmarkCanvas({
  imageUrl,
  landmarks,
  onChange,
  disabled = false,
}: LandmarkCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [activePoint, setActivePoint] = useState<string | null>(null)
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  })

  const handleImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) {
      setNaturalDimensions({ width: naturalWidth, height: naturalHeight })
    }
  }

  const getSvgCoordinates = useCallback(
    (e: PointerEvent): LandmarkCoord | null => {
      if (!svgRef.current) return null
      const svg = svgRef.current
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const screenCTM = svg.getScreenCTM()
      if (!screenCTM) return null
      const svgP = pt.matrixTransform(screenCTM.inverse())
      return {
        x: Math.round(Math.max(0, Math.min(naturalDimensions.width, svgP.x))),
        y: Math.round(Math.max(0, Math.min(naturalDimensions.height, svgP.y))),
      }
    },
    [naturalDimensions],
  )

  const handlePointerDown = (name: string, e: PointerEvent) => {
    if (disabled) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setActivePoint(name)
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (!activePoint || disabled) return
    const coords = getSvgCoordinates(e)
    if (coords) {
      onChange(activePoint, coords)
    }
  }

  const handlePointerUp = (e: PointerEvent) => {
    if (activePoint) {
      try {
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      } catch {
        // no-op if pointer capture was already released
      }
      setActivePoint(null)
    }
  }

  const landmarkMap = new Map(landmarks.map((l) => [l.name, l.coord]))

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border-2 border-slate-900 bg-slate-950 shadow-inner select-none touch-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background Animal Image */}
      <img
        src={imageUrl}
        alt="Animal evaluation subject"
        onLoad={handleImageLoad}
        className="block h-auto w-full object-contain pointer-events-none"
      />

      {/* Interactive SVG Overlay */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${naturalDimensions.width} ${naturalDimensions.height}`}
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Anatomical Guideline Lines */}
        {CONNECTIONS.map(([p1, p2, label, strokeColor]) => {
          const pt1 = landmarkMap.get(p1)
          const pt2 = landmarkMap.get(p2)
          if (!pt1 || !pt2) return null
          const midX = (pt1.x + pt2.x) / 2
          const midY = (pt1.y + pt2.y) / 2

          return (
            <g key={`${p1}-${p2}`}>
              <line
                x1={pt1.x}
                y1={pt1.y}
                x2={pt2.x}
                y2={pt2.y}
                stroke={strokeColor}
                strokeWidth={Math.max(3, naturalDimensions.width / 260)}
                strokeDasharray="6 4"
                opacity="0.85"
              />
              <rect
                x={midX - 45}
                y={midY - 12}
                width="90"
                height="22"
                rx="6"
                fill="#0f172a"
                fillOpacity="0.85"
                stroke={strokeColor}
                strokeWidth="1.5"
              />
              <text
                x={midX}
                y={midY + 3}
                fill="#ffffff"
                fontSize={Math.max(12, naturalDimensions.width / 65)}
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* Draggable Landmark Points */}
        {landmarks.map((l) => {
          const isActive = activePoint === l.name
          const radius = Math.max(10, naturalDimensions.width / 80)
          const touchHitRadius = Math.max(28, naturalDimensions.width / 25)

          return (
            <g
              key={l.name}
              transform={`translate(${l.coord.x}, ${l.coord.y})`}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => handlePointerDown(l.name, e)}
            >
              {/* Invisible large touch target (hitbox >= 32px) */}
              <circle r={touchHitRadius} fill="transparent" />

              {/* Pulsing ring when dragging */}
              {isActive && (
                <circle
                  r={radius + 8}
                  fill={l.color}
                  opacity="0.3"
                  className="animate-ping"
                />
              )}

              {/* Outer halo */}
              <circle
                r={radius + 3}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="2"
                filter="url(#shadow)"
              />

              {/* Core landmark circle */}
              <circle
                r={radius}
                fill={l.color}
                stroke="#ffffff"
                strokeWidth="2"
              />

              {/* Label badge */}
              <g transform={`translate(0, -${radius + 18})`}>
                <rect
                  x="-55"
                  y="-12"
                  width="110"
                  height="24"
                  rx="6"
                  fill="#020617"
                  fillOpacity="0.9"
                  stroke={isActive ? '#38bdf8' : '#ffffff'}
                  strokeWidth="1.5"
                  filter="url(#shadow)"
                />
                <text
                  x="0"
                  y="2"
                  fill="#ffffff"
                  fontSize={Math.max(11, naturalDimensions.width / 70)}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {l.label}
                </text>
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
