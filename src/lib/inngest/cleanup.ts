import { inngest } from "./client"
import { createServiceClient } from "@/lib/supabase/service"
import { runCleanup, generateTitle } from "@/lib/llm/route"
import type { UserTier } from "@/types"

export const cleanupNote = inngest.createFunction(
  { id: "cleanup-note", retries: 2 },
  { event: "note/note.transcribed" },
  async ({ event, step }) => {
    const { noteId, userId, transcriptRaw, language, intensity, tier, durationSec } = event.data

    const cleanupResult = await step.run("run-llm-cleanup", async () => {
      return runCleanup(
        transcriptRaw,
        intensity as "verbatim" | "light" | "full",
        language,
        tier as UserTier,
      )
    })

    const title = await step.run("generate-title", async () => {
      return generateTitle(transcriptRaw, language)
    })

    await step.run("save-result", async () => {
      const db = createServiceClient()
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
    })

    await step.run("update-usage", async () => {
      const db = createServiceClient()
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
            cost_usd: (existing.cost_usd as number) + (cleanupResult.costUsd ?? 0),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
      } else {
        await db.from("usage").insert({
          user_id: userId,
          month,
          minutes_used: minutesUsed,
          notes_count: 1,
          cost_usd: cleanupResult.costUsd ?? 0,
        })
      }
    })

    return { noteId, model: cleanupResult.model, costUsd: cleanupResult.costUsd }
  },
)
