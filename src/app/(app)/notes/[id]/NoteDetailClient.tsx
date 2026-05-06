"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { NoteVersionIntensity } from "@/types"

type NoteStatus = "pending" | "transcribing" | "cleaning" | "ready" | "failed"
type NoteIntensity = "verbatim" | "light" | "full"

const AUDIO_RETENTION_HOURS = 24

interface Note {
  id: string
  title: string | null
  transcript_raw: string | null
  summary: string | null
  status: NoteStatus
  intensity: NoteIntensity | null
  error: string | null
  audio_duration_sec: number | null
  audio_storage_path: string | null
  created_at: string
  ready_at: string | null
}

interface NoteVersion {
  id: string
  intensity: NoteVersionIntensity | null
  custom_prompt: string | null
  summary: string
  llm_model: string | null
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

function versionLabel(v: NoteVersion): string {
  if (v.custom_prompt) return "Custom prompt"
  if (v.intensity && v.intensity !== "custom")
    return INTENSITY_LABELS.get(v.intensity as NoteIntensity) ?? v.intensity
  return "Unknown"
}

function audioTimeRemaining(readyAt: string | null): number {
  if (!readyAt) return 0
  const expiresMs = new Date(readyAt).getTime() + AUDIO_RETENTION_HOURS * 3600 * 1000
  return Math.max(0, expiresMs - Date.now())
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired"
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ─── Sub-component: ready-state content ──────────────────────────────────────

interface NoteReadyContentProps {
  note: Note
  versions: NoteVersion[]
  editingSummary: boolean
  editedSummary: string
  savingSummary: boolean
  regenerating: boolean
  regenError: string | null
  customPrompt: string
  showCustomPrompt: boolean
  showHistory: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onEditedSummaryChange: (val: string) => void
  onSaveSummary: () => void
  onRegenerate: (intensity: NoteIntensity) => void
  onToggleCustomPrompt: () => void
  onCustomPromptChange: (val: string) => void
  onCustomRegenerate: () => void
  onToggleHistory: () => void
}

function NoteReadyContent({
  note,
  versions,
  editingSummary,
  editedSummary,
  savingSummary,
  regenerating,
  regenError,
  customPrompt,
  showCustomPrompt,
  showHistory,
  onStartEdit,
  onCancelEdit,
  onEditedSummaryChange,
  onSaveSummary,
  onRegenerate,
  onToggleCustomPrompt,
  onCustomPromptChange,
  onCustomRegenerate,
  onToggleHistory,
}: NoteReadyContentProps) {
  return (
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
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground/40">
              Summary
            </h2>
            {editingSummary ? (
              <div className="flex gap-2">
                <button
                  onClick={onSaveSummary}
                  disabled={savingSummary}
                  className="text-xs text-foreground/60 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {savingSummary ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={onCancelEdit}
                  className="text-xs text-foreground/30 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onStartEdit}
                className="text-xs text-foreground/30 hover:text-foreground/70 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
          {editingSummary ? (
            <textarea
              value={editedSummary}
              onChange={(e) => onEditedSummaryChange(e.target.value)}
              rows={10}
              className="text-sm bg-foreground/5 border border-foreground/15 rounded-lg px-3 py-2 resize-y outline-none focus:border-foreground/30 transition-colors w-full leading-relaxed"
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.summary}</p>
          )}
        </section>
      </div>

      {/* Regenerate controls */}
      <div className="flex flex-col gap-3 pt-2 border-t border-foreground/10">
        <p className="text-xs text-foreground/40">Regenerate with different intensity:</p>
        <div className="flex gap-2 flex-wrap">
          {(["verbatim", "light", "full"] as NoteIntensity[]).map((intensity) => (
            <button
              key={intensity}
              onClick={() => onRegenerate(intensity)}
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
          <button
            onClick={onToggleCustomPrompt}
            disabled={regenerating}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 ${
              showCustomPrompt
                ? "border-foreground/40 bg-foreground/10 text-foreground"
                : "border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            Custom prompt
          </button>
          {regenerating && (
            <span className="text-xs text-foreground/40 animate-pulse self-center">
              Regenerating…
            </span>
          )}
        </div>
        {showCustomPrompt && (
          <div className="flex flex-col gap-2">
            <textarea
              value={customPrompt}
              onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder='e.g. "Summarise as bullet points for a developer audience."'
              rows={3}
              className="text-sm bg-foreground/5 border border-foreground/15 rounded-lg px-3 py-2 resize-none outline-none focus:border-foreground/30 transition-colors w-full"
            />
            <button
              onClick={onCustomRegenerate}
              disabled={regenerating || !customPrompt.trim()}
              className="self-start text-xs px-4 py-1.5 rounded-full bg-foreground text-background font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              Run with this prompt
            </button>
          </div>
        )}
        {regenError && <p className="text-xs text-red-500">{regenError}</p>}
      </div>

      {/* Version history */}
      {versions.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-foreground/10">
          <button
            onClick={onToggleHistory}
            className="flex items-center gap-1 text-xs text-foreground/40 hover:text-foreground/70 transition-colors self-start"
          >
            <span>{showHistory ? "▾" : "▸"}</span>
            {versions.length} previous version{versions.length !== 1 ? "s" : ""}
          </button>
          {showHistory && (
            <ul className="flex flex-col gap-3 mt-1">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground/60">
                      {versionLabel(v)}
                    </span>
                    <span className="text-xs text-foreground/30">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </div>
                  {v.custom_prompt && (
                    <p className="text-xs text-foreground/40 italic">{v.custom_prompt}</p>
                  )}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/60 line-clamp-4">
                    {v.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NoteDetailClient({ noteId }: { noteId: string }) {
  const router = useRouter()
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState("")
  const [titleDirty, setTitleDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState("")
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [versions, setVersions] = useState<NoteVersion[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [editedSummary, setEditedSummary] = useState("")
  const [savingSummary, setSavingSummary] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [audioCountdown, setAudioCountdown] = useState(0)
  const [downloadingAudio, setDownloadingAudio] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchNote() {
      const res = await fetch(`/api/notes/${noteId}`)
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        setFetchError(body.message ?? `Error ${res.status}`)
        return
      }
      const { note: fetched, versions: fetchedVersions } = (await res.json()) as {
        note: Note
        versions: NoteVersion[]
      }
      setNote(fetched)
      setVersions(fetchedVersions)
      setAudioCountdown(audioTimeRemaining(fetched.ready_at))
      if (!titleDirty) setTitle(fetched.title ?? "")
    }

    void fetchNote()

    const channel = supabase
      .channel(`note-${noteId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes", filter: `id=eq.${noteId}` },
        () => {
          void fetchNote()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  useEffect(() => {
    if (audioCountdown <= 0) return
    const id = setInterval(() => {
      setAudioCountdown((prev) => Math.max(0, prev - 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [audioCountdown])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

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

  async function handleSaveSummary() {
    if (!editedSummary.trim()) return
    setSavingSummary(true)
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: editedSummary }),
      })
      if (res.ok) {
        setNote((prev) => (prev ? { ...prev, summary: editedSummary } : prev))
        setEditingSummary(false)
      }
    } finally {
      setSavingSummary(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await fetch(`/api/notes/${noteId}`, { method: "DELETE" })
      router.push("/notes")
    } finally {
      setDeleting(false)
    }
  }

  async function handleDownloadAudio() {
    setDownloadingAudio(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/audio`)
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        alert(body.error ?? "Audio not available")
        return
      }
      const { url } = (await res.json()) as { url: string }
      const a = document.createElement("a")
      a.href = url
      a.download = `note-${noteId}.webm`
      a.click()
    } finally {
      setDownloadingAudio(false)
    }
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

  async function handleCustomRegenerate() {
    const prompt = customPrompt.trim()
    if (!prompt) return
    setRegenerating(true)
    setRegenError(null)
    try {
      const res = await fetch(`/api/notes/${noteId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intensity: "verbatim", customPrompt: prompt }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        setRegenError(body.message ?? "Regeneration failed")
      } else {
        setCustomPrompt("")
        setShowCustomPrompt(false)
      }
    } catch {
      setRegenError("Network error — please try again")
    } finally {
      setRegenerating(false)
    }
  }

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

  if (fetchError) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-4 py-24 text-center">
        <span className="text-4xl select-none" aria-hidden="true">
          ⚠️
        </span>
        <h1 className="text-xl font-bold tracking-tight">Could not load note</h1>
        <p className="text-sm text-foreground/50 max-w-xs">{fetchError}</p>
        <p className="text-xs text-foreground/40">
          If this persists, run <code className="font-mono">./manage.sh db push</code> to apply
          pending migrations.
        </p>
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
  const hasAudio = !!note.audio_storage_path
  const audioExpired = hasAudio && audioCountdown <= 0 && !!note.ready_at
  const audioAvailable = hasAudio && !audioExpired

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

      {/* Status + actions row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
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

        {note.status === "ready" && hasAudio && (
          <div className="flex items-center gap-3">
            {audioAvailable && (
              <span className="text-xs text-foreground/40">
                Audio expires in{" "}
                <span className={audioCountdown < 3600_000 ? "text-amber-500" : ""}>
                  {formatCountdown(audioCountdown)}
                </span>
              </span>
            )}
            {audioExpired && <span className="text-xs text-foreground/30">Audio expired</span>}
            {audioAvailable && (
              <button
                onClick={() => void handleDownloadAudio()}
                disabled={downloadingAudio}
                className="text-xs px-3 py-1.5 rounded-full border border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
              >
                {downloadingAudio ? "…" : "↓ Download audio"}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-foreground/50">Delete this note?</span>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded-full border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-foreground/40 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-foreground/30 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="rounded-xl bg-foreground/5 border border-foreground/10 p-6 text-center text-sm text-foreground/50">
          Transcription and cleanup are running in the background. This page updates automatically.
        </div>
      )}

      {note.status === "failed" && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500">
          {note.error ?? "An error occurred during processing."}
        </div>
      )}

      {note.status === "ready" && (
        <NoteReadyContent
          note={note}
          versions={versions}
          editingSummary={editingSummary}
          editedSummary={editedSummary}
          savingSummary={savingSummary}
          regenerating={regenerating}
          regenError={regenError}
          customPrompt={customPrompt}
          showCustomPrompt={showCustomPrompt}
          showHistory={showHistory}
          onStartEdit={() => {
            setEditedSummary(note.summary ?? "")
            setEditingSummary(true)
          }}
          onCancelEdit={() => setEditingSummary(false)}
          onEditedSummaryChange={setEditedSummary}
          onSaveSummary={() => void handleSaveSummary()}
          onRegenerate={(intensity) => void handleRegenerate(intensity)}
          onToggleCustomPrompt={() => setShowCustomPrompt((v) => !v)}
          onCustomPromptChange={setCustomPrompt}
          onCustomRegenerate={() => void handleCustomRegenerate()}
          onToggleHistory={() => setShowHistory((v) => !v)}
        />
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
