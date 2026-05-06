import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import {
  isAllowedAudioMimeType,
  MAX_AUDIO_SIZE_FREE,
  MAX_AUDIO_SIZE_PRO,
} from "@/lib/security/sanitize"
import { canRecord, getNoteDurationLimit } from "@/lib/usage/limits"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { inngest } from "@/lib/inngest/client"
import { appLogger } from "@/lib/logger"
import { parseCostCap, isCostCapExceeded } from "@/lib/cost/cap"
import type { UserTier } from "@/types"

const uploadMetaSchema = z.object({
  durationSec: z.coerce.number().int().positive().max(5400),
  language: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- fixed-length quantifiers only; provably safe
    .regex(/^[a-z]{2,3}(-[A-Z]{2,3})?$/)
    .default("en"),
  intensity: z.enum(["verbatim", "light", "full"]).default("verbatim"),
})

interface InngestPayload {
  noteId: string
  userId: string
  storagePath: string
  durationSec: number
  language: string
  intensity: "verbatim" | "light" | "full"
  tier: string
}

async function sendToInngest(payload: InngestPayload): Promise<void> {
  if (!process.env["INNGEST_EVENT_KEY"]) {
    appLogger.debug({ noteId: payload.noteId }, "upload:inngest_skipped_no_key")
    return
  }
  try {
    await inngest.send({ name: "audio/note.uploaded", data: payload })
  } catch (err) {
    appLogger.warn({ err, noteId: payload.noteId }, "upload:inngest_send_failed")
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function resolveMaxSize(tier: UserTier): number {
  if (tier === "pro" || tier === "pro_plus_local") return MAX_AUDIO_SIZE_PRO
  return MAX_AUDIO_SIZE_FREE
}

async function getDailySpendUsd(
  serviceClient: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const { data } = await serviceClient
    .from("notes")
    .select("cost_usd")
    .gte("ready_at", `${today()}T00:00:00.000Z`)
    .not("cost_usd", "is", null)
  return (data ?? []).reduce((sum, row) => sum + ((row.cost_usd as number) ?? 0), 0)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const formData = await request.formData()
    const file = formData.get("file")
    const mimeType = formData.get("mimeType")

    if (!(file instanceof File)) {
      return API_ERRORS.invalidInput({ file: ["File is required"] })
    }

    const resolvedMime = typeof mimeType === "string" && mimeType ? mimeType : file.type
    if (!isAllowedAudioMimeType(resolvedMime)) return API_ERRORS.unsupportedMediaType()

    const meta = uploadMetaSchema.parse({
      durationSec: formData.get("durationSec"),
      language: formData.get("language"),
      intensity: formData.get("intensity"),
    })

    const serviceClient = createServiceClient()

    const [profileResult, usageResult, dailySpend] = await Promise.all([
      serviceClient.from("profiles").select("tier").eq("id", user.id).single(),
      serviceClient
        .from("usage")
        .select("minutes_used")
        .eq("user_id", user.id)
        .eq("month", currentMonth())
        .maybeSingle(),
      getDailySpendUsd(serviceClient),
    ])

    if (isCostCapExceeded(dailySpend, parseCostCap())) {
      appLogger.warn({ dailySpend }, "upload:daily_cost_cap_exceeded")
      return API_ERRORS.serviceUnavailable("Daily processing limit reached — try again tomorrow")
    }

    const tier = ((profileResult.data?.tier as UserTier | undefined) ?? "free") satisfies UserTier
    const minutesUsed = (usageResult.data?.minutes_used as number | undefined) ?? 0
    const requestedMinutes = meta.durationSec / 60

    const noteLimitMin = getNoteDurationLimit(tier)
    if (noteLimitMin !== Infinity && requestedMinutes > noteLimitMin) {
      return API_ERRORS.usageLimitReached(tier)
    }

    if (!canRecord(tier, minutesUsed, requestedMinutes)) {
      return API_ERRORS.usageLimitReached(tier)
    }

    const maxSize = resolveMaxSize(tier)
    if (file.size > maxSize) {
      return API_ERRORS.fileTooLarge(maxSize / (1024 * 1024))
    }

    const { data: note, error: noteErr } = await serviceClient
      .from("notes")
      .insert({
        user_id: user.id,
        status: "pending",
        intensity: meta.intensity,
        language_output: meta.language,
        audio_duration_sec: meta.durationSec,
      })
      .select("id")
      .single()

    if (noteErr || !note) return API_ERRORS.internalError()

    const ext = resolvedMime.includes("mp4") ? "mp4" : "webm"
    const storagePath = `${user.id}/${note.id as string}.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: storageErr } = await serviceClient.storage
      .from("audio")
      .upload(storagePath, arrayBuffer, { contentType: resolvedMime, upsert: false })

    if (storageErr) {
      appLogger.error({ err: storageErr, storagePath }, "upload:storage_write_failed")
      await serviceClient.from("notes").delete().eq("id", note.id)
      return API_ERRORS.internalError()
    }

    await serviceClient.from("notes").update({ audio_storage_path: storagePath }).eq("id", note.id)

    await sendToInngest({
      noteId: note.id as string,
      userId: user.id,
      storagePath,
      durationSec: meta.durationSec,
      language: meta.language,
      intensity: meta.intensity,
      tier,
    })

    return Response.json({ noteId: note.id }, { status: 201 })
  } catch (err) {
    return handleRouteError(err, "api/upload")
  }
}
