import { NonRetriableError } from "inngest"
import { inngest } from "./client"
import { createServiceClient } from "@/lib/supabase/service"
import { routeTranscription } from "@/lib/stt/route"

function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 429
  )
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
        if (isRateLimitError(err)) {
          await db
            .from("notes")
            .update({ status: "failed", error: "STT quota exceeded — please retry later" })
            .eq("id", noteId)
          throw new NonRetriableError("STT rate limit hit", { cause: err })
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
