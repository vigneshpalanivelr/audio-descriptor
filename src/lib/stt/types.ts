export interface TranscribeRequest {
  audioUrl: string
  language: string | null
  noteId: string
  userId: string
}

export interface TranscribeResult {
  transcript: string
  detectedLanguage: string
  durationSeconds: number
  engine: string
  costUsd: number
}
