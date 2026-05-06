"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Waveform } from "./Waveform"
import type { NoteIntensity } from "@/types"

type RecorderState = "idle" | "recording" | "paused" | "review" | "uploading"

interface RecorderProps {
  onComplete?: (noteId: string) => void
  onDiscard?: () => void
}

const INTENSITY_LABELS = new Map<NoteIntensity, string>([
  ["verbatim", "Verbatim"],
  ["light", "Light"],
  ["full", "Full"],
])

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "pt-BR", label: "Portuguese (BR)" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
]

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function getSupportedMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return "audio/webm"
}

function resolveFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4"
  return "webm"
}

// 25 MB — recordings larger than this are re-encoded via ffmpeg-wasm
const MAX_BLOB_BYTES = 25 * 1024 * 1024

async function compressIfNeeded(blob: Blob, mimeType: string): Promise<Blob> {
  if (blob.size <= MAX_BLOB_BYTES) return blob

  const { FFmpeg } = await import("@ffmpeg/ffmpeg")
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util")

  const ffmpeg = new FFmpeg()
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })

  const ext = resolveFileExtension(mimeType)
  const inputName = `input.${ext}`
  const outputName = "output.webm"

  await ffmpeg.writeFile(inputName, await fetchFile(blob))
  // re-encode to opus at 48kbps — keeps quality adequate for voice at <2MB/min
  await ffmpeg.exec(["-i", inputName, "-c:a", "libopus", "-b:a", "48k", outputName])

  const rawData = await ffmpeg.readFile(outputName)
  const uint8 = rawData instanceof Uint8Array ? rawData : new TextEncoder().encode(rawData)
  // slice(0) copies into a plain ArrayBuffer (avoids SharedArrayBuffer BlobPart incompatibility)
  return new Blob([uint8.buffer.slice(0) as ArrayBuffer], { type: "audio/webm;codecs=opus" })
}

interface ControlsProps {
  state: RecorderState
  canSubmit: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSubmit: () => void
  onDiscard: () => void
}

function RecorderControls({
  state,
  canSubmit,
  onStart,
  onPause,
  onResume,
  onStop,
  onSubmit,
  onDiscard,
}: ControlsProps) {
  const btnBase =
    "px-5 py-2.5 rounded-full font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
  const btnPrimary = `${btnBase} bg-foreground text-background hover:opacity-80 focus-visible:ring-foreground`
  const btnSecondary = `${btnBase} bg-foreground/10 text-foreground hover:bg-foreground/20 focus-visible:ring-foreground/50`
  const btnDanger = `${btnBase} bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500`

  if (state === "idle") {
    return (
      <div className="flex justify-center">
        <button onClick={onStart} className={btnPrimary}>
          Start Recording
        </button>
      </div>
    )
  }

  if (state === "recording") {
    return (
      <div className="flex gap-3 justify-center">
        <button onClick={onPause} className={btnSecondary}>
          Pause
        </button>
        <button onClick={onStop} className={btnDanger}>
          Stop
        </button>
      </div>
    )
  }

  if (state === "paused") {
    return (
      <div className="flex gap-3 justify-center">
        <button onClick={onResume} className={btnPrimary}>
          Resume
        </button>
        <button onClick={onStop} className={btnDanger}>
          Stop
        </button>
      </div>
    )
  }

  if (state === "review") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-3 justify-center">
          <button onClick={onDiscard} className={btnSecondary}>
            Discard
          </button>
          <button onClick={onSubmit} disabled={!canSubmit} className={btnPrimary}>
            Transcribe
          </button>
        </div>
        {!canSubmit && (
          <p className="text-xs text-foreground/40">Recording too short — try again</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      <span className="text-sm text-foreground/50 animate-pulse">Uploading…</span>
    </div>
  )
}

export function Recorder({ onComplete, onDiscard }: RecorderProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>("idle")
  const [intensity, setIntensity] = useState<NoteIntensity>("verbatim")
  const [language, setLanguage] = useState("en")
  const [duration, setDuration] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeTypeRef = useRef<string>("")

  function startTimer() {
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startRecording = useCallback(async () => {
    setErrorMsg(null)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      mimeTypeRef.current = mimeType

      const recorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(mediaStream, recorderOptions)

      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(5000)
      setStream(mediaStream)
      setRecorderState("recording")
      setDuration(0)
      startTimer()
      mediaRecorderRef.current = recorder
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone access denied"
      setErrorMsg(message)
    }
  }, [])

  const pauseRecording = useCallback(() => {
    mediaRecorderRef.current?.pause()
    stopTimer()
    setRecorderState("paused")
  }, [])

  const resumeRecording = useCallback(() => {
    mediaRecorderRef.current?.resume()
    startTimer()
    setRecorderState("recording")
  }, [])

  const stopRecording = useCallback(() => {
    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder) {
        resolve()
        return
      }
      recorder.onstop = () => resolve()
      recorder.stop()
      stopTimer()
      stream?.getTracks().forEach((t) => t.stop())
      setStream(null)
      setRecorderState("review")
    })
  }, [stream])

  const discard = useCallback(() => {
    chunksRef.current = []
    setDuration(0)
    setRecorderState("idle")
    setErrorMsg(null)
    onDiscard?.()
  }, [onDiscard])

  const submit = useCallback(async () => {
    setRecorderState("uploading")
    setErrorMsg(null)

    const mimeType = mimeTypeRef.current || "audio/webm"
    let blob = new Blob(chunksRef.current, { type: mimeType })

    try {
      blob = await compressIfNeeded(blob, mimeType)
    } catch {
      setErrorMsg("Could not compress recording — please try a shorter clip")
      setRecorderState("review")
      return
    }

    const ext = resolveFileExtension(blob.type)
    const formData = new FormData()
    formData.append("file", blob, `recording.${ext}`)
    formData.append("mimeType", blob.type)
    formData.append("durationSec", String(duration))
    formData.append("language", language)
    formData.append("intensity", intensity)

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      const json = (await res.json()) as { noteId?: string; message?: string }

      if (!res.ok) {
        setErrorMsg(json.message ?? "Upload failed")
        setRecorderState("review")
        return
      }

      chunksRef.current = []
      setDuration(0)
      setRecorderState("idle")
      if (json.noteId) onComplete?.(json.noteId)
    } catch {
      setErrorMsg("Network error — please try again")
      setRecorderState("review")
    }
  }, [duration, intensity, language, onComplete])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  useEffect(() => {
    return () => stopTimer()
  }, [])

  const controlsDisabled = recorderState !== "idle"

  return (
    <div className="flex flex-col gap-5 w-full max-w-md mx-auto p-5 bg-foreground/5 rounded-2xl border border-foreground/10">
      <Waveform stream={stream} isActive={recorderState === "recording"} />

      <div
        className="text-center font-mono text-4xl font-bold tabular-nums tracking-wider"
        aria-live="polite"
        aria-label={`Recording duration: ${formatDuration(duration)}`}
      >
        {formatDuration(duration)}
      </div>

      <div className="flex gap-2 justify-center" role="group" aria-label="Cleanup intensity">
        {(["verbatim", "light", "full"] as NoteIntensity[]).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setIntensity(lvl)}
            disabled={controlsDisabled}
            aria-pressed={intensity === lvl}
            className={[
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              intensity === lvl
                ? "bg-foreground text-background"
                : "bg-foreground/10 text-foreground/60 hover:bg-foreground/20",
              controlsDisabled ? "opacity-40 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {INTENSITY_LABELS.get(lvl)}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={controlsDisabled}
          className="text-sm bg-foreground/10 rounded-lg px-3 py-1.5 border-0 focus:ring-1 focus:ring-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Recording language"
        >
          {LANGUAGES.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <RecorderControls
        state={recorderState}
        canSubmit={duration > 0}
        onStart={() => void startRecording()}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onStop={() => void stopRecording()}
        onSubmit={() => void submit()}
        onDiscard={discard}
      />

      {errorMsg && (
        <p role="alert" className="text-sm text-red-500 text-center">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
