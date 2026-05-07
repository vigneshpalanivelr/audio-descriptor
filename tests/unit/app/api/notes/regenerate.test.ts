import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: POST /api/notes/[id]/regenerate
// ──────────────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockNoteSingle = vi.fn()
const mockProfileSingle = vi.fn()
const mockNoteUpdate = vi.fn()
const mockVersionInsert = vi.fn()
const mockRunCleanup = vi.fn()
const mockParseCostCap = vi.fn()
const mockIsCostCapExceeded = vi.fn()
const mockRecordAuditEvent = vi.fn()

function makeNoteSelectChain() {
  return { eq: () => ({ eq: () => ({ single: mockNoteSingle }) }) }
}

function makeCostSelectChain() {
  return { gte: () => ({ not: vi.fn().mockResolvedValue({ data: [] }) }) }
}

function buildNotesFrom() {
  return {
    select: (cols: string) => (cols === "cost_usd" ? makeCostSelectChain() : makeNoteSelectChain()),
    update: () => ({ eq: mockNoteUpdate }),
  }
}

function buildServiceClient() {
  return {
    from: (table: string) => {
      if (table === "notes") return buildNotesFrom()
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: mockProfileSingle }) }) }
      }
      return { insert: mockVersionInsert }
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: buildServiceClient,
}))

vi.mock("@/lib/llm/route", () => ({
  runCleanup: mockRunCleanup,
}))

vi.mock("@/lib/cost/cap", () => ({
  parseCostCap: mockParseCostCap,
  isCostCapExceeded: mockIsCostCapExceeded,
}))

vi.mock("@/lib/logger/audit", () => ({
  recordAuditEvent: mockRecordAuditEvent,
}))

vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const VALID_UUID = "00000000-0000-0000-0000-000000000001"
const READY_NOTE = {
  id: VALID_UUID,
  transcript_raw: "Hello world transcript",
  language_output: "en",
  status: "ready",
  user_id: "user-1",
  summary: "Existing summary",
  llm_model: "gpt-4o-mini",
  intensity: "verbatim",
  cost_usd: 0.001,
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/notes/${VALID_UUID}/regenerate`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

async function callRegenerate(body: unknown, id: string = VALID_UUID) {
  const { POST } = await import("@/app/api/notes/[id]/regenerate/route")
  return POST(makeRequest(body), { params: Promise.resolve({ id }) })
}

describe("POST /api/notes/[id]/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    mockNoteSingle.mockResolvedValue({ data: READY_NOTE, error: null })
    mockProfileSingle.mockResolvedValue({ data: { tier: "free" }, error: null })
    mockNoteUpdate.mockResolvedValue({ error: null })
    mockVersionInsert.mockResolvedValue({ error: null })
    mockParseCostCap.mockReturnValue(20)
    mockIsCostCapExceeded.mockReturnValue(false)
    mockRunCleanup.mockResolvedValue({
      summary: "New summary",
      model: "gpt-4o-mini",
      costUsd: 0.001,
    })
    mockRecordAuditEvent.mockResolvedValue(undefined)
  })

  describe("authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const res = await callRegenerate({ intensity: "verbatim" })

      expect(res.status).toBe(401)
    })
  })

  describe("input validation", () => {
    it("returns 422 when noteId is not a valid UUID", async () => {
      const res = await callRegenerate({ intensity: "verbatim" }, "not-a-uuid")

      expect(res.status).toBe(422)
    })

    it("returns 422 when intensity is not a valid enum value", async () => {
      const res = await callRegenerate({ intensity: "maximum" })

      expect(res.status).toBe(422)
    })

    it("returns 422 when customPrompt exceeds 2000 characters", async () => {
      const res = await callRegenerate({ intensity: "verbatim", customPrompt: "x".repeat(2001) })

      expect(res.status).toBe(422)
    })
  })

  describe("note state checks", () => {
    it("returns 404 when note does not exist", async () => {
      mockNoteSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } })

      const res = await callRegenerate({ intensity: "verbatim" })

      expect(res.status).toBe(404)
    })

    it("returns 422 when note is not in ready state", async () => {
      mockNoteSingle.mockResolvedValue({ data: { ...READY_NOTE, status: "pending" }, error: null })

      const res = await callRegenerate({ intensity: "verbatim" })

      expect(res.status).toBe(422)
    })

    it("returns 422 when note has no transcript", async () => {
      mockNoteSingle.mockResolvedValue({
        data: { ...READY_NOTE, transcript_raw: null },
        error: null,
      })

      const res = await callRegenerate({ intensity: "verbatim" })

      expect(res.status).toBe(422)
    })

    it("returns 503 when daily cost cap is exceeded", async () => {
      mockIsCostCapExceeded.mockReturnValue(true)

      const res = await callRegenerate({ intensity: "verbatim" })

      expect(res.status).toBe(503)
    })
  })

  describe("successful regeneration", () => {
    it("returns 200 with summary and model", async () => {
      const res = await callRegenerate({ intensity: "light" })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.summary).toBe("New summary")
      expect(body.model).toBe("gpt-4o-mini")
    })

    it("saves current version to history when existing summary is present", async () => {
      await callRegenerate({ intensity: "full" })

      expect(mockVersionInsert).toHaveBeenCalledWith(
        expect.objectContaining({ summary: "Existing summary" }),
      )
    })

    it("does not save version when note has no existing summary", async () => {
      mockNoteSingle.mockResolvedValue({ data: { ...READY_NOTE, summary: null }, error: null })

      await callRegenerate({ intensity: "verbatim" })

      expect(mockVersionInsert).not.toHaveBeenCalled()
    })

    it("records an audit event", async () => {
      await callRegenerate({ intensity: "verbatim" })

      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        "note.regenerated",
        expect.objectContaining({ resourceId: VALID_UUID }),
      )
    })

    it("passes customPrompt to runCleanup", async () => {
      await callRegenerate({ intensity: "verbatim", customPrompt: "Summarise as bullets" })

      expect(mockRunCleanup).toHaveBeenCalledWith(
        READY_NOTE.transcript_raw,
        "verbatim",
        "en",
        "free",
        "Summarise as bullets",
      )
    })
  })
})
