import { useRef, useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, RefreshCw, Upload, Sparkles, AlertCircle, ArrowLeft } from 'lucide-react'
import api from '../services/api'
import { useDeviceOrientation } from '../hooks/useDeviceOrientation'
import GuidanceOverlay from '../components/GuidanceOverlay'
import QualityWarningModal from '../components/QualityWarningModal'
import type { Animal } from '../types/models'

export default function CaptureScreen() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const animalId = searchParams.get('animalId')

  const [animal, setAnimal] = useState<Animal | null>(null)
  const [loadingAnimal, setLoadingAnimal] = useState<boolean>(() => Boolean(animalId))
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [overrideLevel, setOverrideLevel] = useState(false)
  const [cameraKey, setCameraKey] = useState(0)

  // Capture & Preview State
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStep, setAnalysisStep] = useState<string>('')
  const [qualityFlags, setQualityFlags] = useState<string[]>([])
  const [warningModalOpen, setWarningModalOpen] = useState(false)
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { isLevel, pitchError, rollError, requestPermission } = useDeviceOrientation()

  // Fetch animal metadata if animalId provided
  useEffect(() => {
    if (!animalId) return
    let active = true
    api
      .get<Animal>(`/animals/${animalId}`)
      .then((res) => {
        if (active) setAnimal(res.data)
      })
      .catch((err) => {
        console.error('Failed to load animal details', err)
      })
      .finally(() => {
        if (active) setLoadingAnimal(false)
      })
    return () => {
      active = false
    }
  }, [animalId])

  // Camera stream lifecycle
  useEffect(() => {
    if (previewUrl) return
    let cancelled = false

    requestPermission()
      .then(() =>
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        }),
      )
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
        }
        setCameraActive(true)
        setCameraError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('Camera stream unavailable, falling back to file input:', err)
        setCameraError('Camera access unavailable or denied. Use file upload below.')
        setCameraActive(false)
      })

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      setCameraActive(false)
    }
  }, [previewUrl, cameraKey, requestPermission])

  // Capture Frame from Video
  const handleSnap = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (blob) {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop())
            streamRef.current = null
          }
          setCameraActive(false)
          setCapturedBlob(blob)
          setPreviewUrl(URL.createObjectURL(blob))
        }
      },
      'image/jpeg',
      0.95,
    )
  }

  // Handle File Input Fallback
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      setCameraActive(false)
      setCapturedBlob(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  // Retake photo
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setCapturedBlob(null)
    setPreviewUrl(null)
    setQualityFlags([])
    setWarningModalOpen(false)
    setCurrentEvaluationId(null)
    setCameraKey((k) => k + 1)
  }

  // Reset Camera
  const handleResetCamera = useCallback(() => {
    setCameraKey((k) => k + 1)
  }, [])

  // Upload and analyze photo
  const handleAnalyze = async () => {
    if (!capturedBlob || !animalId) return
    setAnalyzing(true)
    setAnalysisStep('Uploading side profile image...')
    try {
      const formData = new FormData()
      formData.append('animal_id', animalId)
      formData.append('view_type', 'side')
      formData.append('image', capturedBlob, 'capture.jpg')

      // Step 1: Create Evaluation Draft with image
      const evalRes = await api.post<{ evaluation_id: string; image_url: string }>('/evaluations', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const newEvalId = evalRes.data.evaluation_id
      setCurrentEvaluationId(newEvalId)

      // Step 2: Trigger AI Analysis Pipeline
      setAnalysisStep('Analyzing animal posture and detecting ArUco marker...')
      try {
        await api.post(`/evaluations/${newEvalId}/analyze`)
        navigate(`/evaluations/${newEvalId}/adjust`)
      } catch (analyzeErr: unknown) {
        if (typeof analyzeErr === 'object' && analyzeErr !== null && 'response' in analyzeErr) {
          const res = analyzeErr as { response?: { status?: number; data?: { quality_flags?: string[] } } }
          if (res.response?.status === 422 && res.response.data?.quality_flags?.length) {
            setQualityFlags(res.response.data.quality_flags)
            setWarningModalOpen(true)
            return
          }
        }
        navigate(`/evaluations/${newEvalId}/adjust`)
      }
    } catch (err: unknown) {
      console.error('Failed to create evaluation', err)
      const msg = err instanceof Error ? err.message : 'Upload failed'
      alert(`Error during analysis: ${msg}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleProceedAnyway = () => {
    setWarningModalOpen(false)
    if (currentEvaluationId) {
      navigate(`/evaluations/${currentEvaluationId}/adjust`)
    }
  }

  if (!animalId) {
    return (
      <div className="p-6 text-center">
        <AlertCircle size={40} className="mx-auto text-amber-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-900">No Animal Selected</h2>
        <p className="mt-1 text-sm text-slate-600">Please select or register an animal first.</p>
        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="mt-4 inline-flex min-h-touch items-center gap-2 rounded-xl bg-brand-700 px-6 py-2.5 text-sm font-bold text-white shadow"
        >
          Select Animal
        </button>
      </div>
    )
  }

  const canSnap = isLevel || overrideLevel

  return (
    <div className="flex flex-col min-h-dvh bg-slate-950 text-white">
      {/* Top Banner: Animal Details */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate('/animals/new')}
          className="flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white"
        >
          <ArrowLeft size={16} />
          Change
        </button>

        {animal ? (
          <div className="text-center">
            <span className="font-mono text-xs font-black tracking-tight text-brand-400">
              #{animal.tag_id}
            </span>
            <span className="ml-2 text-xs font-bold text-slate-300 capitalize">
              {animal.breed} ({animal.species})
            </span>
          </div>
        ) : (
          <span className="text-xs font-semibold text-slate-400">
            {loadingAnimal ? 'Loading animal...' : 'Ready for Capture'}
          </span>
        )}

        <div className="w-12" />
      </div>

      {/* Main Viewport: Camera or Preview */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-black">
        {previewUrl ? (
          /* Preview Mode */
          <div className="relative h-full w-full flex items-center justify-center p-2">
            <img
              src={previewUrl}
              alt="Captured frame preview"
              className="max-h-[70vh] w-auto rounded-xl object-contain shadow-2xl border border-slate-800"
            />
            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center">
                <div className="h-14 w-14 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                <h3 className="mt-4 text-lg font-bold text-white">AI Analysis in Progress</h3>
                <p className="mt-1 text-xs text-brand-300 font-medium">{analysisStep}</p>
              </div>
            )}
          </div>
        ) : (
          /* Live Camera Stream Mode */
          <div className="relative h-full w-full flex items-center justify-center">
            {cameraActive ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <Camera size={48} className="text-slate-500" />
                <p className="text-sm font-semibold text-slate-300">
                  {cameraError || 'Initializing Camera Feed...'}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 flex min-h-touch items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
                >
                  <Upload size={16} />
                  Choose File from Device
                </button>
              </div>
            )}

            {/* Live Guidance HUD Overlay */}
            {cameraActive && (
              <GuidanceOverlay
                isLevel={isLevel}
                pitchError={pitchError}
                rollError={rollError}
                overrideLevel={overrideLevel}
                onToggleOverride={() => setOverrideLevel(!overrideLevel)}
              />
            )}
          </div>
        )}

        {/* Hidden Canvas and File Input */}
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Bottom Action Footer Controls */}
      <div className="border-t border-slate-800 bg-slate-900/90 p-4 pb-6 backdrop-blur-md">
        {previewUrl ? (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={analyzing}
              onClick={handleRetake}
              className="flex-1 flex min-h-touch items-center justify-center gap-2 rounded-2xl border-2 border-slate-700 bg-slate-800 py-3 text-sm font-bold text-white active:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={18} />
              Retake
            </button>
            <button
              type="button"
              disabled={analyzing}
              onClick={handleAnalyze}
              className="flex-1 flex min-h-touch items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50"
            >
              <Sparkles size={18} />
              {analyzing ? 'Analyzing...' : 'Analyze Photo'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-around">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1 rounded-xl p-2 text-xs font-bold text-slate-300 hover:text-white"
            >
              <Upload size={22} />
              <span>Gallery</span>
            </button>

            {/* Shutter Button */}
            <button
              type="button"
              disabled={!canSnap}
              onClick={handleSnap}
              className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all ${
                canSnap
                  ? 'border-brand-500 bg-brand-600 text-white shadow-[0_0_20px_#22c55e] active:scale-95'
                  : 'border-slate-600 bg-slate-800 text-slate-500 opacity-60'
              }`}
            >
              <Camera size={34} />
            </button>

            <button
              type="button"
              onClick={handleResetCamera}
              className="flex flex-col items-center gap-1 rounded-xl p-2 text-xs font-bold text-slate-300 hover:text-white"
            >
              <RefreshCw size={22} />
              <span>Reset</span>
            </button>
          </div>
        )}
      </div>

      {/* Quality Warning Modal */}
      <QualityWarningModal
        isOpen={warningModalOpen}
        flags={qualityFlags}
        onRetake={handleRetake}
        onProceedAnyway={handleProceedAnyway}
      />
    </div>
  )
}
