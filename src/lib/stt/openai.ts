import OpenAI from "openai"
import type { TranscribeRequest, TranscribeResult } from "./types"

const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] })

export async function transcribeWithOpenAI(request: TranscribeRequest): Promise<TranscribeResult> {
  const response = await fetch(request.audioUrl)
  const audioBlob = await response.blob()
  const audioFile = new File([audioBlob], "audio.webm", { type: "audio/webm" })

  const result = await client.audio.transcriptions.create({
    file: audioFile,
    model: "gpt-4o-mini-transcribe",
    ...(request.language ? { language: request.language } : {}),
    response_format: "verbose_json",
  })

  const durationSeconds = result.duration ?? 0
  const costUsd = (durationSeconds / 60) * 0.003

  return {
    transcript: result.text,
    detectedLanguage: result.language ?? request.language ?? "en",
    durationSeconds,
    engine: "openai",
    costUsd,
  }
}
