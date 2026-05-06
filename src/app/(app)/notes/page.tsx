import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { safeGetUser } from "@/lib/supabase/safe-auth"
import { APP_CONFIG } from "@/config/app"
import type { NoteStatus } from "@/types"

export const metadata = {
  title: `Notes — ${APP_CONFIG.name}`,
}

interface NoteRow {
  id: string
  title: string | null
  status: NoteStatus
  intensity: string | null
  audio_duration_sec: number | null
  created_at: string
}

const STATUS_BADGE: Record<NoteStatus, { label: string; className: string }> = {
  pending: {
    label: "Queued",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  transcribing: {
    label: "Transcribing",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  cleaning: {
    label: "Cleaning",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  ready: {
    label: "Ready",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ""
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default async function NotesPage() {
  const supabase = await createClient()
  const user = await safeGetUser(supabase)

  const { data: notes } = user
    ? await supabase
        .from("notes")
        .select("id, title, status, intensity, audio_duration_sec, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: null }

  const noteList = (notes ?? []) as NoteRow[]

  if (noteList.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center text-center gap-6 py-24">
        <div className="flex flex-col items-center gap-3">
          <span className="text-5xl select-none" aria-hidden="true">
            🎙️
          </span>
          <h1 className="text-2xl font-bold tracking-tight">No notes yet</h1>
          <p className="text-foreground/60 text-sm max-w-xs leading-relaxed">
            Record your first voice note and {APP_CONFIG.name} will transcribe and clean it up for
            you.
          </p>
        </div>
        <Link
          href="/notes/new"
          className="rounded-full bg-foreground text-background px-7 py-3 text-base font-semibold hover:opacity-80 transition-opacity"
        >
          + New Note
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Your Notes</h1>
        <Link
          href="/notes/new"
          className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-semibold hover:opacity-80 transition-opacity"
        >
          + New Note
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {noteList.map((note) => {
          const badge = STATUS_BADGE[note.status]
          return (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/5 p-4 transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium text-sm truncate">
                    {note.title ?? "Untitled note"}
                  </span>
                  <span className="text-xs text-foreground/40">
                    {new Date(note.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {note.audio_duration_sec ? ` · ${formatDuration(note.audio_duration_sec)}` : ""}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
                >
                  {badge.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
