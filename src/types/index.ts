export type UserTier = "free" | "starter" | "pro" | "pro_plus_local"
export type NoteStatus = "pending" | "transcribing" | "cleaning" | "ready" | "failed"
export type NoteIntensity = "verbatim" | "light" | "full"
export type SttEngine = "openai" | "sarvam" | "elevenlabs" | "whisper_local"
export type LlmModel = "claude-haiku-4-5" | "claude-sonnet-4-6" | "gemini-3-flash" | "sarvam-105b"
export type SubscriptionProvider = "razorpay" | "lemonsqueezy"

export interface Profile {
  id: string
  display_name: string | null
  default_language: string
  default_intensity: NoteIntensity
  default_stt_engine: SttEngine | null
  default_llm_model: LlmModel | null
  ui_locale: string
  tier: UserTier
  subscription_status: string
  subscription_provider: SubscriptionProvider | null
  subscription_ref: string | null
  created_at: string
}

export interface Note {
  id: string
  user_id: string
  title: string | null
  transcript_raw: string | null
  summary: string | null
  audio_storage_path: string | null
  audio_duration_sec: number | null
  language_detected: string | null
  language_output: string | null
  intensity: NoteIntensity | null
  stt_engine: SttEngine | null
  llm_model: LlmModel | null
  status: NoteStatus
  error: string | null
  cost_usd: number | null
  tags: string[]
  is_starred: boolean
  is_archived: boolean
  created_at: string
  ready_at: string | null
}

export interface UsageRecord {
  id: string
  user_id: string
  month: string
  minutes_used: number
  notes_count: number
  cost_usd: number
  updated_at: string
}

export interface PaymentEvent {
  id: string
  user_id: string | null
  provider: SubscriptionProvider
  event_type: string
  external_event_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}
