import { describe, it, expect, vi, beforeEach } from "vitest"

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: src/lib/note-processor/index.ts — direct (non-Inngest) processor
// ──────────────────────────────────────────────────────────────────────────────

const mockRouteTranscription = vi.fn()
const mockRunCleanup = vi.fn()
const mockGenerateTitle = vi.fn()
const mockParseCostCap = vi.fn()
const mockIsCostCapExceeded = vi.fn()

vi.mock("@/lib/stt/route", () => ({ routeTranscription: mockRouteTranscription }))
vi.mock("@/lib/llm/route", () => ({
  runCleanup: mockRunCleanup,
  generateTitle: mockGenerateTitle,
}))
vi.mock("@/lib/cost/cap", () => ({
  parseCostCap: mockParseCostCap,
  isCostCapExceeded: mockIsCostCapExceeded,
}))
vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ── Supabase service-client mock ─────────────────────────────────────────────
// Shared mutable state — tests configure these before each run
let mockSignedUrlResult: { data: { signedUrl: string } | null; error: unknown }
let mockCostRows: { cost_usd: number }[]
let mockExistingUsage: Record<string, unknown> | null
let mockNotesUpdateResult: { error: unknown }
let mockUsageUpdateResult: { error: unknown }
let mockUsageInsertResult: { error: unknown }

function buildNotesFrom() {
  return {
    update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => mockNotesUpdateResult) })) })),
    select: vi.fn(() => ({
      gte: vi.fn(() => ({ not: vi.fn().mockResolvedValue({ data: mockCostRows }) })),
    })),
  }
}

function buildUsageFrom() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockExistingUsage }) })),
      })),
    })),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue(mockUsageUpdateResult) })),
    insert: vi.fn().mockResolvedValue(mockUsageInsertResult),
  }
}

function buildStorageFrom() {
  return { createSignedUrl: vi.fn().mockResolvedValue(mockSignedUrlResult) }
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => (table === "notes" ? buildNotesFrom() : buildUsageFrom())),
    storage: { from: vi.fn(buildStorageFrom) },
  })),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────
const PAYLOAD = {
  noteId: "note-1",
  userId: "user-1",
  storagePath: "user-1/note-1.webm",
  durationSec: 60,
  language: "en",
  intensity: "verbatim" as const,
  tier: "free",
}

const STT_RESULT = {
  transcript: "Hello world",
  detectedLanguage: "en",
  engine: "openai",
  durationSeconds: 60,
}

const CLEANUP_RESULT = { summary: "Summary text", model: "gpt-4o-mini", costUsd: 0.001 }

describe("processNoteDirectly", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockSignedUrlResult = { data: { signedUrl: "https://example.com/audio.webm" }, error: null }
    mockCostRows = []
    mockExistingUsage = null
    mockNotesUpdateResult = { error: null }
    mockUsageUpdateResult = { error: null }
    mockUsageInsertResult = { error: null }
    mockRouteTranscription.mockResolvedValue(STT_RESULT)
    mockRunCleanup.mockResolvedValue(CLEANUP_RESULT)
    mockGenerateTitle.mockResolvedValue("Auto Title")
    mockParseCostCap.mockReturnValue(20)
    mockIsCostCapExceeded.mockReturnValue(false)
  })

  it("processes a note end-to-end (new usage row)", async () => {
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockRouteTranscription).toHaveBeenCalledOnce()
    expect(mockRunCleanup).toHaveBeenCalledWith(
      STT_RESULT.transcript,
      PAYLOAD.intensity,
      STT_RESULT.detectedLanguage,
      PAYLOAD.tier,
    )
    expect(mockGenerateTitle).toHaveBeenCalledWith(
      STT_RESULT.transcript,
      STT_RESULT.detectedLanguage,
    )
  })

  it("processes a note end-to-end (existing usage row)", async () => {
    mockExistingUsage = { id: "usage-1", minutes_used: 10, notes_count: 3, cost_usd: 0.05 }
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockRunCleanup).toHaveBeenCalledOnce()
    expect(mockGenerateTitle).toHaveBeenCalledOnce()
  })

  it("marks note as failed when signed URL creation fails (error)", async () => {
    mockSignedUrlResult = { data: null, error: new Error("storage error") }
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockRouteTranscription).not.toHaveBeenCalled()
  })

  it("marks note as failed when signed URL data is null", async () => {
    mockSignedUrlResult = { data: null, error: null }
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockRouteTranscription).not.toHaveBeenCalled()
  })

  it("marks note as failed and skips LLM when daily cost cap is exceeded", async () => {
    mockIsCostCapExceeded.mockReturnValue(true)
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockRunCleanup).not.toHaveBeenCalled()
  })

  it("marks note as failed when transcription throws", async () => {
    mockRouteTranscription.mockRejectedValue(new Error("STT provider down"))
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockRunCleanup).not.toHaveBeenCalled()
  })

  it("handles null costUsd when inserting a new usage row", async () => {
    mockRunCleanup.mockResolvedValue({
      summary: "Summary",
      model: "gemini-2.5-flash",
      costUsd: null,
    })
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockGenerateTitle).toHaveBeenCalledOnce()
  })

  it("handles null costUsd when updating an existing usage row", async () => {
    mockExistingUsage = { id: "usage-1", minutes_used: 5, notes_count: 2, cost_usd: 0 }
    mockRunCleanup.mockResolvedValue({
      summary: "Summary",
      model: "gemini-2.5-flash",
      costUsd: null,
    })
    const { processNoteDirectly } = await import("@/lib/note-processor")
    await processNoteDirectly(PAYLOAD)

    expect(mockGenerateTitle).toHaveBeenCalledOnce()
  })
})
