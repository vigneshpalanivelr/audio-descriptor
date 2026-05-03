"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type NoteStatus = "pending" | "transcribing" | "cleaning" | "ready" | "failed"

interface Note {
  id: string
  title: string | null
  transcript_raw: string | null
  summary: string | null
  status: NoteStatus
  error: string | null
  audio_duration_sec: number | null
  created_at: string
}

const STATUS_LABELS: Record<NoteStatus, string> = {
  pending: "Queued…",
  transcribing: "Transcribing audio…",
  cleaning: "Cleaning up text…",
  ready: "Ready",
  failed: "Failed",
}

const POLL_INTERVAL_MS = 3000

export function NoteDetailClient({ noteId }: { noteId: string }) {
  const router = useRouter()
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState("")
  const [titleDirty, setTitleDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchNote() {
      const { data, error } = await supabase
        .from("notes")
        .select("id, title, transcript_raw, summary, status, error, audio_duration_sec, created_at")
        .eq("id", noteId)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      const fetched = data as Note
      setNote(fetched)
      if (!titleDirty) setTitle(fetched.title ?? "")

      if (fetched.status === "ready" || fetched.status === "failed") {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }

    void fetchNote()

    pollRef.current = setInterval(() => void fetchNote(), POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
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
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full py-8 px-4">
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
        <span className="text-sm text-foreground/50">{STATUS_LABELS[note.status]}</span>
      </div>

      {isProcessing && (
        <div className="rounded-xl bg-foreground/5 border border-foreground/10 p-6 text-center text-sm text-foreground/50">
          Transcription and cleanup are running in the background. This page refreshes
          automatically.
        </div>
      )}

      {note.status === "failed" && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500">
          {note.error ?? "An error occurred during processing."}
        </div>
      )}

      {note.status === "ready" && (
        <div className="flex flex-col gap-5">
          {note.summary && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground/40">
                Summary
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.summary}</p>
            </section>
          )}
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
