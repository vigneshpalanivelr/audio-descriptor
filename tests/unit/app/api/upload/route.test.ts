import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: POST /api/upload — focused on Inngest routing logic
// ──────────────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockInngestSend = vi.fn()
const mockProcessNoteDirectly = vi.fn()
const mockParseCostCap = vi.fn()
const mockIsCostCapExceeded = vi.fn()
const mockCanRecord = vi.fn()
const mockGetNoteDurationLimit = vi.fn()
const mockIsAllowedAudioMimeType = vi.fn()
const mockAppLoggerError = vi.fn()

function makeNoteSingle() {
  return vi.fn().mockResolvedValue({ data: { id: "note-123" }, error: null })
}

function makeNoteUpdateEq() {
  return vi.fn().mockResolvedValue({ error: null })
}

function makeNotesFrom() {
  const noteSingle = makeNoteSingle()
  const noteUpdateEq = makeNoteUpdateEq()
  return {
    insert: () => ({ select: () => ({ single: noteSingle }) }),
    update: () => ({ eq: noteUpdateEq }),
    select: () => ({ gte: () => ({ not: vi.fn().mockResolvedValue({ data: [] }) }) }),
  }
}

function makeProfilesSingle() {
  return vi.fn().mockResolvedValue({ data: { tier: "free" }, error: null })
}

function makeProfilesFrom() {
  const single = makeProfilesSingle()
  return { select: () => ({ eq: () => ({ single }) }) }
}

function makeUsageMaybeSingle() {
  return vi.fn().mockResolvedValue({ data: null, error: null })
}

function makeUsageFrom() {
  const maybeSingle = makeUsageMaybeSingle()
  return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }
}

function buildServiceClient() {
  return {
    from: (table: string) => {
      if (table === "profiles") return makeProfilesFrom()
      if (table === "usage") return makeUsageFrom()
      return makeNotesFrom()
    },
    storage: {
      from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }),
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: buildServiceClient,
}))

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}))

vi.mock("@/lib/note-processor", () => ({
  processNoteDirectly: mockProcessNoteDirectly,
}))

vi.mock("@/lib/cost/cap", () => ({
  parseCostCap: mockParseCostCap,
  isCostCapExceeded: mockIsCostCapExceeded,
}))

vi.mock("@/lib/usage/limits", () => ({
  canRecord: mockCanRecord,
  getNoteDurationLimit: mockGetNoteDurationLimit,
}))

vi.mock("@/lib/security/sanitize", () => ({
  isAllowedAudioMimeType: mockIsAllowedAudioMimeType,
  MAX_AUDIO_SIZE_FREE: 10 * 1024 * 1024,
  MAX_AUDIO_SIZE_PRO: 100 * 1024 * 1024,
}))

vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: mockAppLoggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

function makeMockFormData() {
  const realFile = new File([new Blob(["x"])], "rec.webm", { type: "audio/webm" })
  ;(realFile as unknown as Record<string, unknown>)["arrayBuffer"] = vi
    .fn()
    .mockResolvedValue(new ArrayBuffer(1))
  const values: Record<string, unknown> = {
    file: realFile,
    durationSec: "30",
    language: "en",
    intensity: "verbatim",
  }
  return { get: (key: string) => values[key] ?? null } as unknown as FormData
}

function makeUploadRequest(): NextRequest {
  const fd = makeMockFormData()
  return { formData: () => Promise.resolve(fd) } as unknown as NextRequest
}

async function callUpload() {
  const { POST } = await import("@/app/api/upload/route")
  return POST(makeUploadRequest())
}

describe("POST /api/upload — Inngest routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    delete process.env["INNGEST_EVENT_KEY"]
    delete process.env["INNGEST_DEV"]
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    mockParseCostCap.mockReturnValue(20)
    mockIsCostCapExceeded.mockReturnValue(false)
    mockCanRecord.mockReturnValue(true)
    mockGetNoteDurationLimit.mockReturnValue(Infinity)
    mockIsAllowedAudioMimeType.mockReturnValue(true)
    mockInngestSend.mockResolvedValue(undefined)
    mockProcessNoteDirectly.mockResolvedValue(undefined)
  })

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await callUpload()

    expect(res.status).toBe(401)
  })

  it("returns 503 when daily cost cap is exceeded", async () => {
    mockIsCostCapExceeded.mockReturnValue(true)

    const res = await callUpload()

    expect(res.status).toBe(503)
  })

  it("skips Inngest and uses direct processing when no key and no dev mode", async () => {
    const res = await callUpload()

    expect(res.status).toBe(201)
    expect(mockInngestSend).not.toHaveBeenCalled()
    expect(mockProcessNoteDirectly).toHaveBeenCalled()
  })

  it("uses Inngest when INNGEST_EVENT_KEY is set", async () => {
    process.env["INNGEST_EVENT_KEY"] = "test-key"

    const res = await callUpload()

    expect(res.status).toBe(201)
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "audio/note.uploaded" }),
    )
    expect(mockProcessNoteDirectly).not.toHaveBeenCalled()
  })

  it("uses Inngest when INNGEST_DEV=1 even without an event key", async () => {
    process.env["INNGEST_DEV"] = "1"

    const res = await callUpload()

    expect(res.status).toBe(201)
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "audio/note.uploaded" }),
    )
    expect(mockProcessNoteDirectly).not.toHaveBeenCalled()
  })

  it("falls back to direct processing when Inngest send throws", async () => {
    process.env["INNGEST_EVENT_KEY"] = "test-key"
    mockInngestSend.mockRejectedValue(new Error("Inngest down"))

    const res = await callUpload()

    expect(res.status).toBe(201)
    expect(mockProcessNoteDirectly).toHaveBeenCalled()
  })
})
