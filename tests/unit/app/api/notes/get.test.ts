import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: GET /api/notes/[id]
// ──────────────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockNoteSingle = vi.fn()
const mockVersionsResult = vi.fn()

function buildNotesFrom() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({ single: mockNoteSingle }),
      }),
    }),
  }
}

function buildVersionsFrom() {
  return {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: mockVersionsResult,
        }),
      }),
    }),
  }
}

function buildServiceClient() {
  return {
    from: (table: string) => {
      if (table === "notes") return buildNotesFrom()
      return buildVersionsFrom()
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: buildServiceClient,
}))

vi.mock("@/lib/logger/audit", () => ({
  recordAuditEvent: vi.fn(),
}))

vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const VALID_UUID = "00000000-0000-0000-0000-000000000001"
const READY_NOTE = {
  id: VALID_UUID,
  title: "Test note",
  transcript_raw: "Hello world",
  summary: "A summary",
  status: "ready",
  intensity: "verbatim",
  error: null,
  audio_duration_sec: 60,
  audio_storage_path: null,
  created_at: "2026-05-07T00:00:00Z",
  ready_at: "2026-05-07T00:01:00Z",
  is_pinned: false,
}

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/notes/${VALID_UUID}`, { method: "GET" })
}

async function callGet(id: string = VALID_UUID) {
  const { GET } = await import("@/app/api/notes/[id]/route")
  return GET(makeRequest(), { params: Promise.resolve({ id }) })
}

describe("GET /api/notes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    mockNoteSingle.mockResolvedValue({ data: READY_NOTE, error: null })
    mockVersionsResult.mockResolvedValue({ data: [], error: null })
  })

  describe("authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const res = await callGet()

      expect(res.status).toBe(401)
    })
  })

  describe("input validation", () => {
    it("returns 422 when noteId is not a valid UUID", async () => {
      const res = await callGet("not-a-uuid")

      expect(res.status).toBe(422)
    })
  })

  describe("note not found", () => {
    it("returns 404 when note does not exist (PGRST116)", async () => {
      mockNoteSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } })

      const res = await callGet()

      expect(res.status).toBe(404)
    })

    it("returns 404 when data is null with no error", async () => {
      mockNoteSingle.mockResolvedValue({ data: null, error: null })

      const res = await callGet()

      expect(res.status).toBe(404)
    })
  })

  describe("database errors", () => {
    it("returns 500 when a non-PGRST116 database error occurs", async () => {
      mockNoteSingle.mockResolvedValue({
        data: null,
        error: { code: "42703", message: "column does not exist" },
      })

      const res = await callGet()

      expect(res.status).toBe(500)
    })
  })

  describe("successful fetch", () => {
    it("returns 200 with note and versions", async () => {
      const res = await callGet()
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.note.id).toBe(VALID_UUID)
      expect(body.versions).toEqual([])
    })

    it("includes versions from note_versions table", async () => {
      const version = { id: "v1", summary: "old summary", created_at: "2026-05-06T00:00:00Z" }
      mockVersionsResult.mockResolvedValue({ data: [version], error: null })

      const res = await callGet()
      const body = await res.json()

      expect(body.versions).toEqual([version])
    })

    it("returns empty versions array when note_versions query returns null", async () => {
      mockVersionsResult.mockResolvedValue({ data: null, error: null })

      const res = await callGet()
      const body = await res.json()

      expect(body.versions).toEqual([])
    })
  })
})
