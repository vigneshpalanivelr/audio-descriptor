import type { TranscribeRequest, TranscribeResult } from "./types"

// ElevenLabs Scribe v2 — feature-flagged. Enable via ENABLE_ELEVENLABS=true.
export async function transcribeWithElevenLabs(
  request: TranscribeRequest,
): Promise<TranscribeResult> {
  const apiKey = process.env["ELEVENLABS_API_KEY"]
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured")

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: request.audioUrl,
      model_id: "scribe_v2",
      language_code: request.language ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    text: string
    language_code: string
    duration_secs: number
  }
  const costUsd = (data.duration_secs / 3600) * 0.22

  return {
    transcript: data.text,
    detectedLanguage: data.language_code,
    durationSeconds: data.duration_secs,
    engine: "elevenlabs",
    costUsd,
  }
}
