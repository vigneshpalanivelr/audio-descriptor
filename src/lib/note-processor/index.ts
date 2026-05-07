import { createServiceClient } from "@/lib/supabase/service"
import { routeTranscription } from "@/lib/stt/route"
import { runCleanup, generateTitle } from "@/lib/llm/route"
import { parseCostCap, isCostCapExceeded } from "@/lib/cost/cap"
import { appLogger } from "@/lib/logger"
import type { UserTier } from "@/types"

export interface ProcessNotePayload {
  noteId: string
  userId: string
  storagePath: string
  durationSec: number
  language: string
  intensity: "verbatim" | "light" | "full"
  tier: string
}

async function getDailySpend(db: ReturnType<typeof createServiceClient>): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db
    .from("notes")
    .select("cost_usd")
    .gte("ready_at", `${today}T00:00:00.000Z`)
    .not("cost_usd", "is", null)
  /* c8 ignore next */
  return (data ?? []).reduce((sum, row) => sum + ((row.cost_usd as number) ?? 0), 0)
}

async function updateUsage(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  durationSec: number,
  costUsd: number | null,
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7)
  const minutesUsed = durationSec / 60
  const { data: existing } = await db
    .from("usage")
    .select("id, minutes_used, notes_count, cost_usd")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle()

  if (existing) {
    await db
      .from("usage")
      .update({
        minutes_used: (existing.minutes_used as number) + minutesUsed,
        notes_count: (existing.notes_count as number) + 1,
        cost_usd: (existing.cost_usd as number) + (costUsd ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
  } else {
    await db.from("usage").insert({
      user_id: userId,
      month,
      minutes_used: minutesUsed,
      notes_count: 1,
      cost_usd: costUsd ?? 0,
    })
  }
}

export async function processNoteDirectly(payload: ProcessNotePayload): Promise<void> {
  const { noteId, userId, storagePath, durationSec, language, intensity, tier } = payload
  const db = createServiceClient()

  try {
    await db.from("notes").update({ status: "transcribing" }).eq("id", noteId)

    const { data: signedData, error: signErr } = await db.storage
      .from("audio")
      .createSignedUrl(storagePath, 300)

    if (signErr || !signedData) {
      throw new Error("Could not create signed URL for audio")
    }

    const sttResult = await routeTranscription({
      audioUrl: signedData.signedUrl,
      language,
      noteId,
      userId,
    })

    await db
      .from("notes")
      .update({
        transcript_raw: sttResult.transcript,
        language_detected: sttResult.detectedLanguage,
        stt_engine: sttResult.engine,
        status: "cleaning",
      })
      .eq("id", noteId)

    const dailySpend = await getDailySpend(db)
    if (isCostCapExceeded(dailySpend, parseCostCap())) {
      appLogger.warn({ noteId, dailySpend }, "note-processor:daily_cost_cap_exceeded")
      await db
        .from("notes")
        .update({ status: "failed", error: "Daily processing limit reached — try again tomorrow" })
        .eq("id", noteId)
      return
    }

    const cleanupResult = await runCleanup(
      sttResult.transcript,
      intensity,
      sttResult.detectedLanguage,
      tier as UserTier,
    )

    const title = await generateTitle(sttResult.transcript, sttResult.detectedLanguage)

    await db
      .from("notes")
      .update({
        summary: cleanupResult.summary,
        title,
        llm_model: cleanupResult.model,
        cost_usd: cleanupResult.costUsd,
        status: "ready",
        ready_at: new Date().toISOString(),
      })
      .eq("id", noteId)

    await updateUsage(db, userId, durationSec, cleanupResult.costUsd)
  } catch (err) {
    appLogger.error({ err, noteId }, "note-processor:failed")
    await db
      .from("notes")
      .update({ status: "failed", error: "Processing failed — please retry" })
      .eq("id", noteId)
  }
}
