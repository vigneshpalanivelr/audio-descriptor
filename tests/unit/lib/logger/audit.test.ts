import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock logger before importing audit module
vi.mock("@/lib/logger/index", () => ({
  auditLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock supabase service client
const insertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: insertMock })),
  })),
}))

import { auditLogger } from "@/lib/logger/index"
import {
  recordAuditEvent,
  auditLogin,
  auditLogout,
  auditLoginFailed,
  auditRateLimitExceeded,
  auditWebhookInvalidSignature,
  auditTranscriptionStarted,
  auditTranscriptionCompleted,
  auditUsageLimitReached,
} from "@/lib/logger/audit"

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertMock.mockResolvedValue({ error: null })
  })

  it("always logs to structured logger", async () => {
    await recordAuditEvent("auth.login", { userId: "abc123" })
    expect(auditLogger.info).toHaveBeenCalledOnce()
  })

  it("masks userId to first 8 chars in log output", async () => {
    const fullId = "deadbeef-1234-5678-abcd-000000000000"
    await recordAuditEvent("auth.login", { userId: fullId })
    const logCall = vi.mocked(auditLogger.info).mock.calls[0]
    const logObj = logCall?.[0] as { userId?: string }
    expect(logObj?.userId).toBe("deadbeef…")
    expect(logObj?.userId).not.toContain("1234-5678")
  })

  it("persists event to audit_logs table", async () => {
    await recordAuditEvent("note.created", { userId: "u1", resourceType: "note", resourceId: "n1" })
    expect(insertMock).toHaveBeenCalledOnce()
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("note.created")
    expect(insertArg?.resource_type).toBe("note")
  })

  it("does not throw if DB insert fails", async () => {
    insertMock.mockRejectedValueOnce(new Error("DB connection lost"))
    await expect(recordAuditEvent("auth.login", { userId: "u1" })).resolves.not.toThrow()
    expect(auditLogger.warn).toHaveBeenCalledOnce()
  })

  it("omits userId from DB insert when not provided", async () => {
    await recordAuditEvent("security.rate_limit_exceeded", { ipAddress: "1.2.3.4" })
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.user_id).toBeNull()
  })
})

describe("audit convenience wrappers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("auditLogin fires auth.login event with userId", async () => {
    await auditLogin("user-001", "10.0.0.1")
    const logObj = vi.mocked(auditLogger.info).mock.calls[0]?.[0] as { event: string }
    expect(logObj?.event).toBe("auth.login")
  })

  it("auditLogout fires auth.logout event", async () => {
    await auditLogout("user-002")
    const logObj = vi.mocked(auditLogger.info).mock.calls[0]?.[0] as { event: string }
    expect(logObj?.event).toBe("auth.logout")
  })

  it("auditLoginFailed fires auth.login_failed with no userId", async () => {
    await auditLoginFailed("1.2.3.4")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("auth.login_failed")
    expect(insertArg?.user_id).toBeNull()
  })

  it("auditRateLimitExceeded includes route in metadata", async () => {
    await auditRateLimitExceeded("1.2.3.4", "/api/upload")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("security.rate_limit_exceeded")
    expect(insertArg?.metadata?.route).toBe("/api/upload")
  })

  it("auditWebhookInvalidSignature includes provider in metadata", async () => {
    await auditWebhookInvalidSignature("razorpay", "5.6.7.8")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("payment.webhook_invalid_signature")
    expect(insertArg?.metadata?.provider).toBe("razorpay")
  })

  it("auditTranscriptionStarted includes durationSeconds and sttEngine", async () => {
    await auditTranscriptionStarted("u1", "note-1", 120, "openai")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("usage.transcription_started")
    expect(insertArg?.metadata?.durationSeconds).toBe(120)
    expect(insertArg?.metadata?.sttEngine).toBe("openai")
  })

  it("auditTranscriptionCompleted includes costUsd and llmModel", async () => {
    await auditTranscriptionCompleted("u1", "note-1", 0.00123, "claude-haiku-4-5-20251001")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("usage.transcription_completed")
    expect(insertArg?.metadata?.llmModel).toBe("claude-haiku-4-5-20251001")
  })

  it("auditUsageLimitReached includes tier in metadata", async () => {
    await auditUsageLimitReached("u1", "free")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("usage.limit_reached")
    expect(insertArg?.metadata?.tier).toBe("free")
  })

  it("auditLogin omits ipAddress and userAgent when not provided", async () => {
    await auditLogin("user-003")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.ip_address).toBeNull()
    expect(insertArg?.user_agent).toBeNull()
  })

  it("auditLogout omits ipAddress when not provided", async () => {
    await auditLogout("user-004")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.ip_address).toBeNull()
  })

  it("auditLoginFailed works with no arguments", async () => {
    await auditLoginFailed()
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.event_type).toBe("auth.login_failed")
    expect(insertArg?.ip_address).toBeNull()
  })

  it("auditWebhookInvalidSignature omits ip when not provided", async () => {
    await auditWebhookInvalidSignature("lemonsqueezy")
    const insertArg = insertMock.mock.calls[0]?.[0]
    expect(insertArg?.ip_address).toBeNull()
    expect(insertArg?.metadata?.provider).toBe("lemonsqueezy")
  })
})
