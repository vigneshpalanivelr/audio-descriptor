import { NonRetriableError } from "inngest"
import { inngest } from "./client"
import { createServiceClient } from "@/lib/supabase/service"
import { routeTranscription } from "@/lib/stt/route"

function isNonRetriableHttpError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("status" in err)) return false
  const status = (err as { status: unknown }).status
  // 429 = quota exceeded, 404 = model/resource not found — retrying won't help
  return status === 429 || status === 404
}

function humanErrorMessage(err: unknown): string {
  const status = (err as { status?: unknown }).status
  if (status === 429) return "STT quota exceeded — please retry later"
  if (status === 404) return "STT model not found — check GEMINI_STT_MODEL in .env.local"
  return "STT request failed"
}

export const transcribeNote = inngest.createFunction(
  { id: "transcribe-note", retries: 2 },
  { event: "audio/note.uploaded" },
  async ({ event, step }) => {
    const { noteId, userId, storagePath, language, intensity, tier } = event.data

    await step.run("mark-transcribing", async () => {
      const db = createServiceClient()
      await db.from("notes").update({ status: "transcribing" }).eq("id", noteId)
    })

    const result = await step.run("transcribe-audio", async () => {
      const db = createServiceClient()
      const { data: signedData, error: signErr } = await db.storage
        .from("audio")
        .createSignedUrl(storagePath, 300)
      if (signErr || !signedData) throw new Error("Could not create signed URL for audio")

      try {
        return await routeTranscription({
          audioUrl: signedData.signedUrl,
          language: language ?? null,
          noteId,
          userId,
        })
      } catch (err) {
        if (isNonRetriableHttpError(err)) {
          await db
            .from("notes")
            .update({ status: "failed", error: humanErrorMessage(err) })
            .eq("id", noteId)
          throw new NonRetriableError(humanErrorMessage(err), { cause: err })
        }
        throw err
      }
    })

    await step.run("save-transcript", async () => {
      const db = createServiceClient()
      await db
        .from("notes")
        .update({
          transcript_raw: result.transcript,
          language_detected: result.detectedLanguage,
          stt_engine: result.engine,
          status: "cleaning",
        })
        .eq("id", noteId)
    })

    await step.sendEvent("trigger-cleanup", {
      name: "note/note.transcribed",
      data: {
        noteId,
        userId,
        transcriptRaw: result.transcript,
        language: result.detectedLanguage,
        intensity: intensity as "verbatim" | "light" | "full",
        tier,
        durationSec: result.durationSeconds,
      },
    })

    return { noteId, engine: result.engine }
  },
)
