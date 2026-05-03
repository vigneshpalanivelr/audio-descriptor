import { GoogleGenerativeAI } from "@google/generative-ai"
import type { TranscribeRequest, TranscribeResult } from "./types"

const genAI = new GoogleGenerativeAI(process.env["GOOGLE_GEMINI_API_KEY"] ?? "")

export async function transcribeWithGemini(request: TranscribeRequest): Promise<TranscribeResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

  const audioResponse = await fetch(request.audioUrl)
  const audioBuffer = await audioResponse.arrayBuffer()
  const base64Audio = Buffer.from(audioBuffer).toString("base64")

  const mimeType = request.audioUrl.includes(".mp4") ? "audio/mp4" : "audio/webm"

  const langHint = request.language ? ` The recording is in ${request.language}.` : ""
  const prompt = `Transcribe this audio recording verbatim.${langHint} Return only the transcription text, no headings or commentary.`

  const result = await model.generateContent([
    { inlineData: { data: base64Audio, mimeType } },
    prompt,
  ])

  return {
    transcript: result.response.text().trim(),
    detectedLanguage: request.language ?? "en",
    durationSeconds: 0,
    engine: "gemini",
    costUsd: 0,
  }
}
