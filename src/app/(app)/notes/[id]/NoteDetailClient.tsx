"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type NoteStatus = "pending" | "transcribing" | "cleaning" | "ready" | "failed"
type NoteIntensity = "verbatim" | "light" | "full"

interface Note {
  id: string
  title: string | null
  transcript_raw: string | null
  summary: string | null
  status: NoteStatus
  intensity: NoteIntensity | null
  error: string | null
  audio_duration_sec: number | null
  created_at: string
}

const STATUS_LABELS = new Map<NoteStatus, string>([
  ["pending", "Queued…"],
  ["transcribing", "Transcribing audio…"],
  ["cleaning", "Cleaning up text…"],
  ["ready", "Ready"],
  ["failed", "Failed"],
])

const INTENSITY_LABELS = new Map<NoteIntensity, string>([
  ["verbatim", "Verbatim"],
  ["light", "Light cleanup"],
  ["full", "Full rewrite"],
])

export function NoteDetailClient({ noteId }: { noteId: string }) {
  const router = useRouter()
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState("")
  const [titleDirty, setTitleDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchNote() {
      const { data, error } = await supabase
        .from("notes")
        .select(
          "id, title, transcript_raw, summary, status, intensity, error, audio_duration_sec, created_at",
        )
        .eq("id", noteId)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      const fetched = data as Note
      setNote(fetched)
      if (!titleDirty) setTitle(fetched.title ?? "")
    }

    void fetchNote()

    // Realtime subscription for live status updates
    const channel = supabase
      .channel(`note-${noteId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes", filter: `id=eq.${noteId}` },
        (payload) => {
          const updated = payload.new as Note
          setNote(updated)
          if (!titleDirty) setTitle(updated.title ?? "")
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setTitle(val)
    setTitleDirty(true)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => void saveTitle(val), 800)
  }

  async function saveTitle(val: string) {
    setSaving(true)
    await supabase
      .from("notes")
      .update({ title: val || null })
      .eq("id", noteId)
    setSaving(false)
  }

  async function handleRegenerate(intensity: NoteIntensity) {
    setRegenerating(true)
    setRegenError(null)
    try {
      const res = await fetch(`/api/notes/${noteId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intensity }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        setRegenError(body.message ?? "Regeneration failed")
      }
    } catch {
      setRegenError("Network error — please try again")
    } finally {
      setRegenerating(false)
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  if (notFound) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-4 py-24 text-center">
        <span className="text-4xl select-none" aria-hidden="true">
          🔍
        </span>
        <h1 className="text-xl font-bold tracking-tight">Note not found</h1>
        <button
          onClick={() => router.push("/notes")}
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Back to notes
        </button>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center py-24">
        <span className="text-sm text-foreground/40 animate-pulse">Loading…</span>
      </div>
    )
  }

  const isProcessing = note.status !== "ready" && note.status !== "failed"

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full py-8 px-4">
      {/* Title + meta */}
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled note"
          className="text-2xl font-bold tracking-tight bg-transparent border-0 border-b border-transparent hover:border-foreground/20 focus:border-foreground/40 outline-none transition-colors py-1 w-full"
          aria-label="Note title"
        />
        <div className="flex items-center gap-2 text-xs text-foreground/30">
          <span>{new Date(note.created_at).toLocaleString()}</span>
          {saving && <span className="animate-pulse">· saving…</span>}
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        {isProcessing && (
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        )}
        {note.status === "ready" && (
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        )}
        {note.status === "failed" && (
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
        )}
        <span className="text-sm text-foreground/50">{STATUS_LABELS.get(note.status)}</span>
      </div>

      {/* Processing placeholder */}
      {isProcessing && (
        <div className="rounded-xl bg-foreground/5 border border-foreground/10 p-6 text-center text-sm text-foreground/50">
          Transcription and cleanup are running in the background. This page updates automatically
          via Realtime.
        </div>
      )}

      {/* Error state */}
      {note.status === "failed" && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500">
          {note.error ?? "An error occurred during processing."}
        </div>
      )}

      {/* Ready: side-by-side transcript ↔ summary */}
      {note.status === "ready" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {note.transcript_raw && (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground/40">
                  Transcript
                </h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/70">
                  {note.transcript_raw}
                </p>
              </section>
            )}
            {note.summary && (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground/40">
                  Summary
                </h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.summary}</p>
              </section>
            )}
          </div>

          {/* Regenerate controls */}
          <div className="flex flex-col gap-2 pt-2 border-t border-foreground/10">
            <p className="text-xs text-foreground/40">Regenerate with different intensity:</p>
            <div className="flex gap-2 flex-wrap">
              {(["verbatim", "light", "full"] as NoteIntensity[]).map((intensity) => (
                <button
                  key={intensity}
                  onClick={() => void handleRegenerate(intensity)}
                  disabled={regenerating}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 ${
                    note.intensity === intensity
                      ? "border-foreground/40 bg-foreground/10 text-foreground"
                      : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  {INTENSITY_LABELS.get(intensity)}
                  {note.intensity === intensity && " ✓"}
                </button>
              ))}
              {regenerating && (
                <span className="text-xs text-foreground/40 animate-pulse self-center">
                  Regenerating…
                </span>
              )}
            </div>
            {regenError && <p className="text-xs text-red-500">{regenError}</p>}
          </div>
        </div>
      )}

      <button
        onClick={() => router.push("/notes")}
        className="self-start text-sm text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        ← All notes
      </button>
    </div>
  )
}
