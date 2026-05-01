import type { TranscribeRequest, TranscribeResult } from "./types"

// Sarvam Saaras v3 — feature-flagged. Enable via ENABLE_SARVAM=true.
export async function transcribeWithSarvam(request: TranscribeRequest): Promise<TranscribeResult> {
  const apiKey = process.env["SARVAM_API_KEY"]
  if (!apiKey) throw new Error("SARVAM_API_KEY is not configured")

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: request.audioUrl,
      language_code: request.language ?? "hi-IN",
      model: "saaras:v3",
    }),
  })

  if (!response.ok) {
    throw new Error(`Sarvam API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    transcript: string
    language_code: string
    duration: number
  }
  const costUsd = (data.duration / 3600) * 0.36

  return {
    transcript: data.transcript,
    detectedLanguage: data.language_code,
    durationSeconds: data.duration,
    engine: "sarvam",
    costUsd,
  }
}
