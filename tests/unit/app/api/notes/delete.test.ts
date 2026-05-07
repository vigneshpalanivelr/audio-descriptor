import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: DELETE /api/notes/[id]
// ──────────────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockDeleteEq = vi.fn()
const mockStorageRemove = vi.fn()
const mockRecordAuditEvent = vi.fn()

function buildNotesFrom() {
  return {
    select: () => ({ eq: () => ({ eq: () => ({ single: mockSingle }) }) }),
    delete: () => ({ eq: mockDeleteEq }),
  }
}

function buildServiceClient() {
  return {
    from: (table: string) => (table === "notes" ? buildNotesFrom() : {}),
    storage: { from: () => ({ remove: mockStorageRemove }) },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: buildServiceClient,
}))

vi.mock("@/lib/logger/audit", () => ({
  recordAuditEvent: mockRecordAuditEvent,
}))

vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const VALID_UUID = "00000000-0000-0000-0000-000000000001"

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/notes/${VALID_UUID}`, { method: "DELETE" })
}

function makeParams(id: string = VALID_UUID) {
  return Promise.resolve({ id })
}

async function callDelete(id: string = VALID_UUID) {
  const { DELETE } = await import("@/app/api/notes/[id]/route")
  return DELETE(makeRequest(), { params: makeParams(id) })
}

describe("DELETE /api/notes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockRecordAuditEvent.mockResolvedValue(undefined)
    mockDeleteEq.mockResolvedValue({ error: null })
    mockStorageRemove.mockResolvedValue({ error: null })
  })

  describe("authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const res = await callDelete()

      expect(res.status).toBe(401)
    })
  })

  describe("input validation", () => {
    it("returns 422 when noteId is not a valid UUID", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

      const res = await callDelete("not-a-uuid")

      expect(res.status).toBe(422)
    })
  })

  describe("note not found", () => {
    it("returns 404 when note does not exist", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } })

      const res = await callDelete()

      expect(res.status).toBe(404)
    })

    it("returns 404 when fetchErr is set", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockSingle.mockResolvedValue({ data: null, error: { message: "DB error" } })

      const res = await callDelete()

      expect(res.status).toBe(404)
    })
  })

  describe("successful deletion", () => {
    it("returns 204 when note has no audio", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockSingle.mockResolvedValue({
        data: { id: VALID_UUID, audio_storage_path: null },
        error: null,
      })

      const res = await callDelete()

      expect(res.status).toBe(204)
      expect(mockStorageRemove).not.toHaveBeenCalled()
    })

    it("removes audio from storage before deleting note", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockSingle.mockResolvedValue({
        data: { id: VALID_UUID, audio_storage_path: "user-1/note-1.webm" },
        error: null,
      })

      const res = await callDelete()

      expect(res.status).toBe(204)
      expect(mockStorageRemove).toHaveBeenCalledWith(["user-1/note-1.webm"])
    })

    it("records audit event with hadAudio: false when no audio", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockSingle.mockResolvedValue({
        data: { id: VALID_UUID, audio_storage_path: null },
        error: null,
      })

      await callDelete()

      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        "note.deleted",
        expect.objectContaining({ metadata: { hadAudio: false } }),
      )
    })

    it("records audit event with hadAudio: true when audio existed", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
      mockSingle.mockResolvedValue({
        data: { id: VALID_UUID, audio_storage_path: "user-1/note-1.webm" },
        error: null,
      })

      await callDelete()

      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        "note.deleted",
        expect.objectContaining({ metadata: { hadAudio: true } }),
      )
    })
  })
})
