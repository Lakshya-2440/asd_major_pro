export type Species = 'cattle' | 'buffalo'

export type EvaluationStatus =
  | 'draft'
  | 'pending_analysis'
  | 'analyzed'
  | 'failed_quality'
  | 'confirmed'
  | 'synced'

export type BpaSyncStatus = 'pending' | 'synced' | 'failed'

export interface Animal {
  id: string
  tag_id: string
  species: Species
  breed: string
  owner_name?: string | null
  village?: string | null
  created_at?: string
  previous_evaluations_count?: number
}

export interface LandmarkCoord {
  x: number
  y: number
}

export interface LandmarkItem {
  id?: string
  name: string
  estimated_pos: LandmarkCoord
  corrected_pos?: LandmarkCoord | null
  confidence?: number | null
}

export interface MeasurementItem {
  id?: string
  name: string
  value: number
  unit: string
  confidence?: number | null
}

export interface TraitScoreItem {
  id?: string
  trait_name: string
  ai_score: number
  final_score: number
  override_reason?: string | null
}

export interface BpaSyncItem {
  id?: string
  status: BpaSyncStatus
  attempts?: number
  last_error?: string | null
  bpa_reference_id?: string | null
  synced_at?: string | null
  created_at?: string
}

export interface EvaluationImageItem {
  id: string
  view_type: 'side' | 'rear' | 'front'
  image_url: string
  quality_flags: string[]
}

export interface ScoreOverrideAuditItem {
  id: string
  trait_name: string
  previous_score: number
  final_score: number
  override_reason: string
  changed_by: string
  changed_by_name?: string
  changed_at: string
}

export interface Evaluation {
  id: string
  animal_id: string
  evaluator_id: string
  status: EvaluationStatus
  overall_score: number | null
  pipeline_version?: string | null
  pixels_per_cm?: number | null
  created_at: string
  updated_at: string
  animal: Animal
  evaluator?: {
    id: string
    name: string
    email: string
    role: string
  }
  images?: EvaluationImageItem[]
  landmarks?: LandmarkItem[]
  measurements?: MeasurementItem[]
  trait_scores?: TraitScoreItem[]
  bpa_sync?: BpaSyncItem[]
  score_override_audit?: ScoreOverrideAuditItem[]
}
