import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { uuidSchema } from "@/lib/security/sanitize"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { recordAuditEvent } from "@/lib/logger/audit"

const patchSchema = z.object({
  summary: z.string().min(1).max(100_000).optional(),
  title: z.string().max(500).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const noteId = uuidSchema.parse(id)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const serviceClient = createServiceClient()

    const [noteResult, versionsResult] = await Promise.all([
      serviceClient
        .from("notes")
        .select(
          "id, title, transcript_raw, summary, status, intensity, error, audio_duration_sec, audio_storage_path, created_at, ready_at",
        )
        .eq("id", noteId)
        .eq("user_id", user.id)
        .single(),
      serviceClient
        .from("note_versions")
        .select("id, intensity, custom_prompt, summary, llm_model, created_at")
        .eq("note_id", noteId)
        .order("created_at", { ascending: false })
        .limit(20),
    ])

    if (noteResult.error?.code === "PGRST116" || !noteResult.data) {
      return API_ERRORS.notFound("Note")
    }
    if (noteResult.error) return API_ERRORS.internalError()

    return Response.json({ note: noteResult.data, versions: versionsResult.data ?? [] })
  } catch (err) {
    return handleRouteError(err, "api/notes/[id] GET")
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const noteId = uuidSchema.parse(id)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const body = await request.json()
    const updates = patchSchema.parse(body)
    if (!updates.summary && !updates.title) {
      return API_ERRORS.invalidInput({ body: ["At least one of summary or title is required"] })
    }

    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from("notes")
      .update({ ...updates })
      .eq("id", noteId)
      .eq("user_id", user.id)

    if (error) return API_ERRORS.notFound("Note")

    await recordAuditEvent("note.updated", {
      userId: user.id,
      resourceType: "note",
      resourceId: noteId,
      metadata: { fields: Object.keys(updates).join(",") },
    })

    return Response.json({ ok: true })
  } catch (err) {
    return handleRouteError(err, "api/notes/[id] PATCH")
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    const noteId = uuidSchema.parse(id)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const serviceClient = createServiceClient()

    const { data: note, error: fetchErr } = await serviceClient
      .from("notes")
      .select("id, audio_storage_path")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single()

    if (fetchErr || !note) return API_ERRORS.notFound("Note")

    const storagePath = note.audio_storage_path as string | null
    if (storagePath) {
      await serviceClient.storage.from("audio").remove([storagePath])
    }

    await serviceClient.from("notes").delete().eq("id", noteId)

    await recordAuditEvent("note.deleted", {
      userId: user.id,
      resourceType: "note",
      resourceId: noteId,
      metadata: { hadAudio: !!storagePath },
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    return handleRouteError(err, "api/notes/[id] DELETE")
  }
}
