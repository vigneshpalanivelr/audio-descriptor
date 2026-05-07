import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { uuidSchema } from "@/lib/security/sanitize"
import { runCleanup } from "@/lib/llm/route"
import { parseCostCap, isCostCapExceeded } from "@/lib/cost/cap"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { appLogger } from "@/lib/logger"
import { recordAuditEvent } from "@/lib/logger/audit"
import type { UserTier } from "@/types"

const regenerateSchema = z.object({
  intensity: z.enum(["verbatim", "light", "full"]).default("light"),
  customPrompt: z.string().max(2000).optional(),
})

async function getDailySpendUsd(): Promise<number> {
  const db = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db
    .from("notes")
    .select("cost_usd")
    .gte("ready_at", `${today}T00:00:00.000Z`)
    .not("cost_usd", "is", null)
  return (data ?? []).reduce((sum, row) => sum + ((row.cost_usd as number) ?? 0), 0)
}

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const noteId = uuidSchema.parse(id)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const body = await request.json()
    const { intensity, customPrompt } = regenerateSchema.parse(body)

    const serviceClient = createServiceClient()

    const { data: note, error: fetchErr } = await serviceClient
      .from("notes")
      .select(
        "id, transcript_raw, language_output, status, user_id, summary, llm_model, intensity, cost_usd",
      )
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single()

    if (fetchErr || !note) return API_ERRORS.notFound("Note")
    if (note.status !== "ready") {
      return API_ERRORS.invalidInput({ status: ["Note must be in ready state to regenerate"] })
    }

    const transcript = note.transcript_raw as string | null
    if (!transcript) {
      return API_ERRORS.invalidInput({ transcript: ["Note has no transcript to regenerate from"] })
    }

    const dailySpend = await getDailySpendUsd()
    if (isCostCapExceeded(dailySpend, parseCostCap())) {
      appLogger.warn({ noteId, dailySpend }, "regenerate:daily_cost_cap_exceeded")
      return API_ERRORS.serviceUnavailable("Daily processing limit reached — try again tomorrow")
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("tier")
      .eq("id", user.id)
      .single()
    const tier = ((profile?.tier as UserTier | undefined) ?? "free") satisfies UserTier

    const language = (note.language_output as string | null) ?? "en"
    const result = await runCleanup(transcript, intensity, language, tier, customPrompt)

    // Save the current version to history before overwriting
    const currentSummary = note.summary as string | null
    if (currentSummary) {
      const versionIntensity = customPrompt
        ? "custom"
        : ((note.intensity as string | null) ?? intensity)
      await serviceClient.from("note_versions").insert({
        note_id: noteId,
        user_id: user.id,
        intensity: versionIntensity,
        ...(customPrompt ? { custom_prompt: customPrompt } : {}),
        summary: currentSummary,
        llm_model: (note.llm_model as string | null) ?? null,
        cost_usd: (note.cost_usd as number | null) ?? null,
      })
    }

    const newIntensity = customPrompt ? null : intensity
    await serviceClient
      .from("notes")
      .update({
        summary: result.summary,
        intensity: newIntensity,
        ...(customPrompt ? { custom_prompt: customPrompt } : { custom_prompt: null }),
        llm_model: result.model,
        cost_usd: result.costUsd,
      })
      .eq("id", noteId)

    await recordAuditEvent("note.regenerated", {
      userId: user.id,
      resourceType: "note",
      resourceId: noteId,
      metadata: { intensity: customPrompt ? "custom" : intensity, model: result.model },
    })

    return Response.json({ summary: result.summary, model: result.model })
  } catch (err) {
    return handleRouteError(err, "api/notes/regenerate")
  }
}
