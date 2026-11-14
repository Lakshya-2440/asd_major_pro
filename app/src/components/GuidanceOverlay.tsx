import { AlertTriangle, CheckCircle2, SlidersHorizontal } from 'lucide-react'

interface GuidanceOverlayProps {
  isLevel: boolean
  pitchError: number
  rollError: number
  overrideLevel: boolean
  onToggleOverride: () => void
}

export default function GuidanceOverlay({
  isLevel,
  pitchError,
  rollError,
  overrideLevel,
  onToggleOverride,
}: GuidanceOverlayProps) {
  const levelOk = isLevel || overrideLevel

  // Visual bubble offset limited to +/- 40px
  const bubbleX = Math.max(-40, Math.min(40, rollError * 4))
  const bubbleY = Math.max(-40, Math.min(40, (pitchError - 0) * 4))

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 select-none">
      {/* Top HUD: Status & Tips */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold shadow-lg backdrop-blur-md transition-colors ${
            levelOk ? 'bg-brand-600/90 text-white' : 'bg-red-600/90 text-white'
          }`}
        >
          {levelOk ? (
            <>
              <CheckCircle2 size={18} />
              <span>Camera Level & Ready</span>
            </>
          ) : (
            <>
              <AlertTriangle size={18} className="animate-pulse" />
              <span>Tilt camera perpendicular to ground</span>
            </>
          )}
        </div>

        <div className="rounded-lg bg-black/60 px-3 py-1 text-center text-xs font-medium text-slate-100 backdrop-blur-sm">
          Ensure all 4 hooves, spine, and tail head are visible
        </div>
      </div>

      {/* Center Framing: Cow Silhouette Outline & Bubble Level */}
      <div className="relative flex flex-1 items-center justify-center">
        {/* Silhouette SVG outline */}
        <div className="relative aspect-[4/3] w-full max-w-sm">
          <svg
            viewBox="0 0 400 300"
            className="h-full w-full drop-shadow-md"
            fill="none"
            stroke="currentColor"
          >
            {/* Viewfinder crosshairs */}
            <path
              d="M 20 20 L 50 20 M 20 20 L 20 50
                 M 380 20 L 350 20 M 380 20 L 380 50
                 M 20 280 L 50 280 M 20 280 L 20 250
                 M 380 280 L 350 280 M 380 280 L 380 250"
              stroke="#ffffff"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.8"
            />

            {/* Stylized bovine side silhouette */}
            <path
              d="M 65 145
                 C 70 120, 85 95, 110 90
                 C 125 87, 135 75, 145 65
                 C 155 58, 175 60, 185 75
                 C 190 82, 205 85, 230 85
                 C 260 85, 290 88, 320 100
                 C 340 108, 355 125, 355 150
                 C 355 175, 345 195, 340 240
                 L 325 242 L 315 190
                 C 290 195, 260 198, 235 195
                 L 225 240 L 210 240 L 215 190
                 C 195 190, 175 185, 155 180
                 L 145 242 L 130 242 L 140 175
                 C 120 170, 95 160, 75 160
                 Z"
              stroke={levelOk ? 'rgba(74, 222, 128, 0.75)' : 'rgba(248, 113, 113, 0.75)'}
              strokeWidth="2.5"
              strokeDasharray="6 4"
              fill={levelOk ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)'}
            />

            {/* Ground Line Reference */}
            <line
              x1="30"
              y1="245"
              x2="370"
              y2="245"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="4 4"
              opacity="0.6"
            />
          </svg>

          {/* ArUco Marker Placement Box Indicator */}
          <div className="absolute bottom-4 left-6 flex flex-col items-center rounded border-2 border-dashed border-amber-400 bg-amber-400/20 p-1.5 text-[10px] font-bold text-amber-200">
            <span>ARUCO MARKER</span>
            <span className="text-[9px] font-normal opacity-90">(On ground plane)</span>
          </div>

          {/* Center Bubble Level Indicator */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/60 bg-black/40 backdrop-blur-sm">
              {/* Center bullseye ring */}
              <div className="h-6 w-6 rounded-full border border-dashed border-white/80" />
              {/* Moving spirit bubble */}
              <div
                className={`absolute h-4 w-4 rounded-full transition-transform duration-100 ${
                  levelOk ? 'bg-brand-400 shadow-[0_0_8px_#4ade80]' : 'bg-red-400 shadow-[0_0_8px_#f87171]'
                }`}
                style={{
                  transform: `translate(${bubbleX}px, ${bubbleY}px)`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom HUD: Sensor Override Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleOverride}
          className={`pointer-events-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold shadow-md transition-colors ${
            overrideLevel
              ? 'bg-amber-500 text-slate-950'
              : 'bg-black/60 text-white hover:bg-black/80'
          }`}
        >
          <SlidersHorizontal size={14} />
          {overrideLevel ? 'Override: Active' : 'Bypass Level Check'}
        </button>

        <span className="rounded bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          Tilt: {Math.round(pitchError)}° / {Math.round(rollError)}°
        </span>
      </div>
    </div>
  )
}
