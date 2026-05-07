import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TranscribeRequest, TranscribeResult } from "@/lib/stt/types"

const STUB_RESULT: TranscribeResult = {
  transcript: "hello world",
  detectedLanguage: "en",
  durationSeconds: 5,
  engine: "openai",
  costUsd: 0.001,
}

const openaiMock = vi.fn().mockResolvedValue(STUB_RESULT)
const sarvamMock = vi
  .fn()
  .mockResolvedValue({ ...STUB_RESULT, detectedLanguage: "hi", engine: "sarvam" })
const elevenLabsMock = vi.fn().mockResolvedValue({ ...STUB_RESULT, engine: "elevenlabs" })
const geminiMock = vi.fn().mockResolvedValue({ ...STUB_RESULT, engine: "gemini" })

vi.mock("@/lib/stt/openai", () => ({ transcribeWithOpenAI: openaiMock }))
vi.mock("@/lib/stt/sarvam", () => ({ transcribeWithSarvam: sarvamMock }))
vi.mock("@/lib/stt/elevenlabs", () => ({ transcribeWithElevenLabs: elevenLabsMock }))
vi.mock("@/lib/stt/gemini", () => ({ transcribeWithGemini: geminiMock }))

const BASE_REQUEST: TranscribeRequest = {
  audioUrl: "https://storage.example.com/audio/test.webm",
  language: "en",
  noteId: "note-001",
  userId: "user-001",
}

describe("routeTranscription — OpenAI (key present)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ENABLE_SARVAM", "false")
    vi.stubEnv("ENABLE_ELEVENLABS", "false")
    vi.stubEnv("ELEVENLABS_PREMIUM", "false")
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("routes to OpenAI for English by default", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription(BASE_REQUEST)
    expect(openaiMock).toHaveBeenCalledOnce()
    expect(sarvamMock).not.toHaveBeenCalled()
  })

  it("routes to OpenAI for unknown language", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "de" })
    expect(openaiMock).toHaveBeenCalledOnce()
  })

  it("routes to OpenAI for Indian language when Sarvam disabled", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "hi" })
    expect(openaiMock).toHaveBeenCalledOnce()
    expect(sarvamMock).not.toHaveBeenCalled()
  })
})

describe("routeTranscription — Gemini fallback (no OpenAI key)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ENABLE_SARVAM", "false")
    vi.stubEnv("ENABLE_ELEVENLABS", "false")
    vi.stubEnv("ELEVENLABS_PREMIUM", "false")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
  })

  it("falls back to Gemini when OPENAI_API_KEY is absent", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription(BASE_REQUEST)
    expect(geminiMock).toHaveBeenCalledOnce()
    expect(openaiMock).not.toHaveBeenCalled()
  })

  it("still uses Sarvam for Indian language even with no OpenAI key", async () => {
    vi.stubEnv("ENABLE_SARVAM", "true")
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "hi" })
    expect(sarvamMock).toHaveBeenCalledOnce()
    expect(geminiMock).not.toHaveBeenCalled()
  })
})

describe("routeTranscription — no provider configured", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ENABLE_SARVAM", "false")
    vi.stubEnv("ENABLE_ELEVENLABS", "false")
    vi.stubEnv("ELEVENLABS_PREMIUM", "false")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("throws when no STT provider key is set", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await expect(routeTranscription(BASE_REQUEST)).rejects.toThrow("No STT provider configured")
  })
})

describe("routeTranscription — Sarvam enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ENABLE_SARVAM", "true")
    vi.stubEnv("ENABLE_ELEVENLABS", "false")
    vi.stubEnv("ELEVENLABS_PREMIUM", "false")
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("routes Hindi to Sarvam when enabled", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "hi" })
    expect(sarvamMock).toHaveBeenCalledOnce()
    expect(openaiMock).not.toHaveBeenCalled()
  })

  it("routes Tamil to Sarvam when enabled", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "ta" })
    expect(sarvamMock).toHaveBeenCalledOnce()
  })

  it("routes English to OpenAI even when Sarvam enabled", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "en" })
    expect(openaiMock).toHaveBeenCalledOnce()
    expect(sarvamMock).not.toHaveBeenCalled()
  })

  it("normalises uppercase language code to lowercase before routing", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "HI" })
    expect(sarvamMock).toHaveBeenCalledOnce()
  })
})

describe("routeTranscription — ElevenLabs premium override", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ENABLE_SARVAM", "true")
    vi.stubEnv("ENABLE_ELEVENLABS", "true")
    vi.stubEnv("ELEVENLABS_PREMIUM", "true")
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("routes to ElevenLabs when both flags set, even for Indian language", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    await routeTranscription({ ...BASE_REQUEST, language: "hi" })
    expect(elevenLabsMock).toHaveBeenCalledOnce()
    expect(sarvamMock).not.toHaveBeenCalled()
    expect(openaiMock).not.toHaveBeenCalled()
  })
})

describe("routeTranscription — null language", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ENABLE_SARVAM", "false")
    vi.stubEnv("ENABLE_ELEVENLABS", "false")
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("defaults to OpenAI when language is null", async () => {
    const { routeTranscription } = await import("@/lib/stt/route")
    const req: TranscribeRequest = { ...BASE_REQUEST, language: null }
    await routeTranscription(req)
    expect(openaiMock).toHaveBeenCalledOnce()
  })
})
