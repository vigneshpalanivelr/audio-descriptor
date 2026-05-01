import { isIndianLanguage } from "./languages"
import type { TranscribeRequest, TranscribeResult } from "./types"

const ENABLE_SARVAM = process.env["ENABLE_SARVAM"] === "true"
const ENABLE_ELEVENLABS = process.env["ENABLE_ELEVENLABS"] === "true"

export async function routeTranscription(request: TranscribeRequest): Promise<TranscribeResult> {
  const lang = request.language?.toLowerCase() ?? "en"

  if (ENABLE_ELEVENLABS && process.env["ELEVENLABS_PREMIUM"] === "true") {
    const { transcribeWithElevenLabs } = await import("./elevenlabs")
    return transcribeWithElevenLabs(request)
  }

  if (ENABLE_SARVAM && isIndianLanguage(lang)) {
    const { transcribeWithSarvam } = await import("./sarvam")
    return transcribeWithSarvam(request)
  }

  const { transcribeWithOpenAI } = await import("./openai")
  return transcribeWithOpenAI(request)
}
