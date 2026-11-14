import { useEffect, useState, useCallback } from 'react'

export interface DeviceOrientationState {
  isLevel: boolean
  beta: number | null
  gamma: number | null
  alpha: number | null
  pitchError: number
  rollError: number
  supported: boolean
  permissionState: 'prompt' | 'granted' | 'denied'
  requestPermission: () => Promise<void>
}

// Tolerance in degrees for perpendicular ground alignment
const TOLERANCE_DEG = 5

export function useDeviceOrientation(): DeviceOrientationState {
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window

  const [beta, setBeta] = useState<number | null>(null)
  const [gamma, setGamma] = useState<number | null>(null)
  const [alpha, setAlpha] = useState<number | null>(null)
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>(() => {
    if (typeof window === 'undefined') return 'prompt'
    const DeviceOrientation = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    return typeof DeviceOrientation?.requestPermission === 'function' ? 'prompt' : 'granted'
  })

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    if (event.beta === null && event.gamma === null) return
    setBeta(event.beta)
    setGamma(event.gamma)
    setAlpha(event.alpha)
  }, [])

  const requestPermission = useCallback(async () => {
    const DeviceOrientation = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }

    if (typeof DeviceOrientation?.requestPermission === 'function') {
      try {
        const response = await DeviceOrientation.requestPermission()
        setPermissionState(response)
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation)
        }
      } catch {
        setPermissionState('denied')
      }
    } else {
      setPermissionState('granted')
    }
  }, [handleOrientation])

  useEffect(() => {
    if (!supported) return
    window.addEventListener('deviceorientation', handleOrientation)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [supported, handleOrientation])

  // Phone held vertically perpendicular to ground:
  // beta is ~90 deg (pitch), gamma is ~0 deg (roll)
  const pitchTarget = 90
  const rollTarget = 0

  const currentBeta = beta ?? 90
  const currentGamma = gamma ?? 0

  const pitchError = Math.abs(currentBeta - pitchTarget)
  const rollError = Math.abs(currentGamma - rollTarget)

  // Level if within tolerance or if no orientation sensor is providing data
  const isLevel = (beta === null && gamma === null) || (pitchError <= TOLERANCE_DEG && rollError <= TOLERANCE_DEG)

  return {
    isLevel,
    beta,
    gamma,
    alpha,
    pitchError,
    rollError,
    supported,
    permissionState,
    requestPermission,
  }
}
