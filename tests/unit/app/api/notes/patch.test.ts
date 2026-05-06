import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: PATCH /api/notes/[id] — note title/summary update
// ──────────────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockServiceUpdate = vi.fn()
const mockRecordAuditEvent = vi.fn()

function mockServiceFactory() {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({ eq: mockServiceUpdate }),
      }),
    }),
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mockServiceFactory,
}))

vi.mock("@/lib/logger/audit", () => ({
  recordAuditEvent: mockRecordAuditEvent,
}))

vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const VALID_UUID = "00000000-0000-0000-0000-000000000001"

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/notes/${VALID_UUID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

function makeParams(id: string = VALID_UUID): Promise<{ id: string }> {
  return Promise.resolve({ id })
}

async function callPatch(body: unknown, id: string = VALID_UUID) {
  const { PATCH } = await import("@/app/api/notes/[id]/route")
  return PATCH(makeRequest(body), { params: makeParams(id) })
}

describe("PATCH /api/notes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockRecordAuditEvent.mockResolvedValue(undefined)
  })

  describe("authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      const res = await callPatch({ title: "New Title" })

      expect(res.status).toBe(401)
    })
  })

  describe("input validation", () => {
    it("returns 422 when body has no title or summary", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      const res = await callPatch({})

      expect(res.status).toBe(422)
    })

    it("returns 422 when title exceeds 500 characters", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

      const res = await callPatch({ title: "x".repeat(501) })

      expect(res.status).toBe(422)
    })

    it("returns 422 when summary exceeds 100,000 characters", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

      const res = await callPatch({ summary: "x".repeat(100_001) })

      expect(res.status).toBe(422)
    })

    it("returns 422 when noteId is not a valid UUID", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

      const res = await callPatch({ title: "New Title" }, "not-a-uuid")

      expect(res.status).toBe(422)
    })
  })

  describe("successful updates", () => {
    it("returns 200 with { ok: true } when updating title", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      const res = await callPatch({ title: "New Title" })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ ok: true })
    })

    it("returns 200 with { ok: true } when updating summary", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      const res = await callPatch({ summary: "Updated summary" })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ ok: true })
    })

    it("returns 200 when updating both title and summary", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      const res = await callPatch({ title: "New Title", summary: "New Summary" })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ ok: true })
    })

    it("accepts a title exactly 500 characters long", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      const res = await callPatch({ title: "x".repeat(500) })

      expect(res.status).toBe(200)
    })

    it("records an audit event after successful update", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: null })

      await callPatch({ title: "Audit Title" })

      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        "note.updated",
        expect.objectContaining({
          userId: "user-1",
          resourceType: "note",
          resourceId: VALID_UUID,
        }),
      )
    })
  })

  describe("database errors", () => {
    it("returns 404 when service client update fails", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: { message: "Not found" } })

      const res = await callPatch({ title: "New Title" })

      expect(res.status).toBe(404)
    })

    it("does not record audit event when update fails", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockServiceUpdate.mockResolvedValue({ error: { message: "DB error" } })

      await callPatch({ title: "New Title" })

      expect(mockRecordAuditEvent).not.toHaveBeenCalled()
    })
  })
})
