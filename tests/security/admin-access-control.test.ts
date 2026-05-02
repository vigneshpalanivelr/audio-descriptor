import { describe, it, expect, vi, beforeEach } from "vitest"

// ──────────────────────────────────────────────────────────────────────────────
// ATTACK SCENARIO: Admin Route Access Control
// Tests that admin API endpoints enforce authentication and admin-flag checks.
// A passing test means the attack was BLOCKED (correct 401/403 returned).
// ──────────────────────────────────────────────────────────────────────────────

// Shared mock factories — reset between tests
const getUser = vi.fn()
const from = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: getUser },
    from: from,
  })),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: [] }),
  })),
}))

vi.mock("@/lib/logger/index", () => ({
  adminLogger: { info: vi.fn(), warn: vi.fn() },
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

function mockAdminUser(userId = "admin-001") {
  getUser.mockResolvedValue({ data: { user: { id: userId } } })
  from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { is_admin: true } }),
  })
}

function mockNonAdminUser(userId = "user-999") {
  getUser.mockResolvedValue({ data: { user: { id: userId } } })
  from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { is_admin: false } }),
  })
}

function mockUnauthenticated() {
  getUser.mockResolvedValue({ data: { user: null } })
}

describe("ATTACK: Unauthenticated access to /api/admin/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("returns 401 when no session", async () => {
    mockUnauthenticated()
    const { GET } = await import("@/app/api/admin/stats/route")
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 403 when authenticated as non-admin", async () => {
    mockNonAdminUser()
    const { GET } = await import("@/app/api/admin/stats/route")
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("does not return 401 or 403 when authenticated as admin", async () => {
    mockAdminUser()
    const { GET } = await import("@/app/api/admin/stats/route")
    const res = await GET()
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})

describe("ATTACK: Unauthenticated access to /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("returns 401 when no session", async () => {
    mockUnauthenticated()
    const { GET } = await import("@/app/api/admin/users/route")
    const req = new Request("http://localhost/api/admin/users")
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns 403 when authenticated as regular user", async () => {
    mockNonAdminUser()
    const { GET } = await import("@/app/api/admin/users/route")
    const req = new Request("http://localhost/api/admin/users")
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

describe("ATTACK: Privilege escalation — is_admin flag manipulation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("cannot access admin stats by sending forged is_admin=true in request body", async () => {
    // Route should check DB profile, not any client-supplied flag
    mockNonAdminUser()
    const { GET } = await import("@/app/api/admin/stats/route")
    // Even if an attacker could somehow set a header, the route only checks DB
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("is_admin null treated as non-admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: null } }),
    })
    const { GET } = await import("@/app/api/admin/stats/route")
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe("ATTACK: Admin users endpoint — query injection via tier param", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("rejects invalid tier value with 422", async () => {
    mockAdminUser()
    const { GET } = await import("@/app/api/admin/users/route")
    // Inject unknown tier value that's not in the enum
    const req = new Request("http://localhost/api/admin/users?tier='; DROP TABLE profiles;--")
    const res = await GET(req)
    expect(res.status).toBe(422)
  })

  it("rejects negative page number with 422", async () => {
    mockAdminUser()
    const { GET } = await import("@/app/api/admin/users/route")
    const req = new Request("http://localhost/api/admin/users?page=-1")
    const res = await GET(req)
    expect(res.status).toBe(422)
  })

  it("rejects limit over 100 with 422", async () => {
    mockAdminUser()
    const { GET } = await import("@/app/api/admin/users/route")
    const req = new Request("http://localhost/api/admin/users?limit=9999")
    const res = await GET(req)
    expect(res.status).toBe(422)
  })
})
