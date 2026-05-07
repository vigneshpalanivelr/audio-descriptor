import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { uuidSchema } from "@/lib/security/sanitize"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"

const AUDIO_RETENTION_HOURS = 24
const SIGNED_URL_EXPIRES_SEC = 300

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

    const { data: note, error: fetchErr } = await serviceClient
      .from("notes")
      .select("audio_storage_path, ready_at")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single()

    if (fetchErr || !note) return API_ERRORS.notFound("Note")

    const storagePath = note.audio_storage_path as string | null
    if (!storagePath) {
      return Response.json({ error: "No audio available for this note" }, { status: 404 })
    }

    const readyAt = note.ready_at as string | null
    if (readyAt) {
      const expiresMs = new Date(readyAt).getTime() + AUDIO_RETENTION_HOURS * 3600 * 1000
      if (Date.now() > expiresMs) {
        // Lazily clean up expired audio
        await serviceClient.storage.from("audio").remove([storagePath])
        await serviceClient.from("notes").update({ audio_storage_path: null }).eq("id", noteId)

        return Response.json({ error: "Audio has expired and been removed" }, { status: 410 })
      }
    }

    const { data: signedData, error: signErr } = await serviceClient.storage
      .from("audio")
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_SEC)

    if (signErr || !signedData?.signedUrl) {
      return Response.json({ error: "Could not generate audio download URL" }, { status: 500 })
    }

    return Response.json({ url: signedData.signedUrl })
  } catch (err) {
    return handleRouteError(err, "api/notes/[id]/audio GET")
  }
}
