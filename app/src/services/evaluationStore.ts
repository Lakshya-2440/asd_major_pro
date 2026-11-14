import type { Evaluation, Animal, TraitScoreItem } from '../types/models'

const STORAGE_KEY = 'cached_evaluations'

export function getAllStoredEvaluations(): Evaluation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function getStoredEvaluation(id: string): Evaluation | null {
  const all = getAllStoredEvaluations()
  return all.find((e) => e.id === id) || null
}

export function saveStoredEvaluation(ev: Evaluation): void {
  try {
    const all = getAllStoredEvaluations()
    const filtered = all.filter((e) => e.id !== ev.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([ev, ...filtered]))
  } catch (err) {
    console.warn('Failed to save evaluation to localStorage', err)
  }
}

export function createMockEvaluation(
  evalId: string,
  animal: Animal,
  imageUrl?: string,
): Evaluation {
  const isBuffalo = animal.species === 'buffalo'

  const mockMeasurements = [
    { name: 'stature', value: isBuffalo ? 138.2 : 132.4, unit: 'cm', confidence: 0.94 },
    { name: 'body_length', value: isBuffalo ? 158.0 : 151.8, unit: 'cm', confidence: 0.92 },
    { name: 'body_depth', value: isBuffalo ? 78.5 : 74.2, unit: 'cm', confidence: 0.89 },
    { name: 'rump_angle', value: isBuffalo ? 24.1 : 22.6, unit: 'deg', confidence: 0.88 },
  ]

  const mockTraitScores: TraitScoreItem[] = [
    { trait_name: 'stature', ai_score: isBuffalo ? 8 : 7, final_score: isBuffalo ? 8 : 7 },
    { trait_name: 'body_length', ai_score: isBuffalo ? 8 : 8, final_score: isBuffalo ? 8 : 8 },
    { trait_name: 'body_depth', ai_score: isBuffalo ? 7 : 7, final_score: isBuffalo ? 7 : 7 },
    { trait_name: 'rump_angle', ai_score: isBuffalo ? 6 : 6, final_score: isBuffalo ? 6 : 6 },
  ]

  const defaultImg = imageUrl || (isBuffalo ? '/samples/buffalo_murrah_01.jpg' : '/samples/cow_gir_01.jpg')

  const ev: Evaluation = {
    id: evalId,
    animal_id: animal.id,
    animal,
    evaluator_id: 'guest-typer-001',
    evaluator: {
      id: 'guest-typer-001',
      name: 'Field Typer (Guest)',
      email: 'typer@rgm.gov.in',
      role: 'typer',
    },
    status: 'analyzed',
    overall_score: isBuffalo ? 83.5 : 81.8,
    pipeline_version: 'v0.2.0-rc',
    pixels_per_cm: 4.82,
    images: [
      {
        id: `img-${Date.now()}`,
        view_type: 'side',
        image_url: defaultImg,
        quality_flags: [],
      },
    ],
    landmarks: [
      { id: '1', name: 'withers', estimated_pos: { x: isBuffalo ? 630 : 652, y: 255 }, confidence: 0.95 },
      { id: '2', name: 'shoulder_point', estimated_pos: { x: isBuffalo ? 780 : 813, y: 334 }, confidence: 0.91 },
      { id: '3', name: 'hip_point', estimated_pos: { x: isBuffalo ? 440 : 462, y: 255 }, confidence: 0.93 },
      { id: '4', name: 'pin_bone', estimated_pos: { x: isBuffalo ? 160 : 140, y: 359 }, confidence: 0.88 },
      { id: '5', name: 'brisket', estimated_pos: { x: isBuffalo ? 600 : 617, y: 547 }, confidence: 0.89 },
      { id: '6', name: 'front_hoof', estimated_pos: { x: isBuffalo ? 600 : 620, y: 645 }, confidence: 0.92 },
      { id: '7', name: 'rear_hoof', estimated_pos: { x: isBuffalo ? 280 : 300, y: 645 }, confidence: 0.90 },
    ],
    measurements: mockMeasurements,
    trait_scores: mockTraitScores,
    score_override_audit: [],
    bpa_sync: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  saveStoredEvaluation(ev)
  return ev
}

export function updateStoredLandmarks(
  evalId: string,
  landmarkCoords: Record<string, { x: number; y: number }>,
): Evaluation | null {
  const ev = getStoredEvaluation(evalId)
  if (!ev) return null

  ev.landmarks = (ev.landmarks || []).map((l) => {
    if (landmarkCoords[l.name]) {
      return {
        ...l,
        corrected_pos: landmarkCoords[l.name],
      }
    }
    return l
  })
  ev.updated_at = new Date().toISOString()
  saveStoredEvaluation(ev)
  return ev
}

export function updateStoredScore(
  evalId: string,
  traitName: string,
  finalScore: number,
  reason: string,
): Evaluation | null {
  const ev = getStoredEvaluation(evalId)
  if (!ev) return null

  ev.trait_scores = (ev.trait_scores || []).map((t) => {
    if (t.trait_name === traitName) {
      return {
        ...t,
        final_score: finalScore,
        override_reason: reason,
      }
    }
    return t
  })

  // Recalculate composite
  const scores = ev.trait_scores
  if (scores.length > 0) {
    const sum = scores.reduce((acc, s) => acc + (s.final_score ?? s.ai_score ?? 5), 0)
    ev.overall_score = Math.round(50 + (sum / (scores.length * 9)) * 50)
  }

  ev.status = 'confirmed'
  ev.score_override_audit = [
    {
      id: `audit-${Date.now()}`,
      trait_name: traitName,
      previous_score: 7,
      final_score: finalScore,
      override_reason: reason,
      changed_by: 'guest-typer-001',
      changed_by_name: 'Field Typer (Guest)',
      changed_at: new Date().toISOString(),
    },
    ...(ev.score_override_audit || []),
  ]
  ev.updated_at = new Date().toISOString()
  saveStoredEvaluation(ev)
  return ev
}

export function syncStoredBpa(evalId: string): { referenceId: string; evaluation: Evaluation } | null {
  const ev = getStoredEvaluation(evalId)
  if (!ev) return null

  const referenceId = `BPA-2026-IND-${Math.floor(100000 + Math.random() * 900000)}`
  ev.status = 'synced'
  ev.bpa_sync = [
    {
      id: `sync-${Date.now()}`,
      status: 'synced',
      attempts: 1,
      bpa_reference_id: referenceId,
      synced_at: new Date().toISOString(),
    },
  ]
  ev.updated_at = new Date().toISOString()
  saveStoredEvaluation(ev)
  return { referenceId, evaluation: ev }
}
