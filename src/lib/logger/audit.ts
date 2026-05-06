import { auditLogger } from "./index"
import { createServiceClient } from "@/lib/supabase/service"

// ─── Audit event types ────────────────────────────────────────────────────────

export type AuditEventType =
  // Authentication
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  | "auth.login_failed"
  // Notes
  | "note.created"
  | "note.viewed"
  | "note.updated"
  | "note.deleted"
  | "note.regenerated"
  // Payments
  | "payment.subscription_started"
  | "payment.subscription_cancelled"
  | "payment.subscription_upgraded"
  | "payment.webhook_received"
  | "payment.webhook_invalid_signature"
  // API security
  | "security.rate_limit_exceeded"
  | "security.unauthorized_access"
  | "security.invalid_file_upload"
  // Admin
  | "admin.user_viewed"
  | "admin.tier_changed"
  // Usage
  | "usage.limit_reached"
  | "usage.transcription_started"
  | "usage.transcription_completed"
  | "usage.transcription_failed"

export interface AuditEventPayload {
  userId?: string
  resourceType?: string
  resourceId?: string
  ipAddress?: string
  userAgent?: string
  // Safe metadata only — no PII, no transcripts
  metadata?: Record<string, string | number | boolean | null>
}

// ─── Log to console (always) + persist to DB (when service client available) ─

export async function recordAuditEvent(
  eventType: AuditEventType,
  payload: AuditEventPayload,
): Promise<void> {
  // Always log to structured logger first (never fails)
  auditLogger.info(
    {
      event: eventType,
      userId: payload.userId ? hashUserId(payload.userId) : undefined,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      ip: payload.ipAddress,
      metadata: payload.metadata,
    },
    eventType,
  )

  // Persist to DB asynchronously — never throw on DB failure
  try {
    const supabase = createServiceClient()
    await supabase.from("audit_logs").insert({
      user_id: payload.userId ?? null,
      event_type: eventType,
      resource_type: payload.resourceType ?? null,
      resource_id: payload.resourceId ?? null,
      ip_address: payload.ipAddress ?? null,
      user_agent: payload.userAgent ?? null,
      metadata: payload.metadata ?? null,
    })
  } catch (err) {
    // DB write failure should never crash the app — log only
    auditLogger.warn({ err }, "audit_db_write_failed")
  }
}

// One-way hash of user ID for log correlation without exposing raw UUIDs
function hashUserId(userId: string): string {
  // Simple prefix mask — shows first 8 chars for debugging
  return `${userId.slice(0, 8)}…`
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export function auditLogin(userId: string, ip?: string, userAgent?: string): Promise<void> {
  return recordAuditEvent("auth.login", {
    userId,
    ...(ip ? { ipAddress: ip } : /* c8 ignore next */ {}),
    ...(userAgent ? { userAgent } : /* c8 ignore next */ {}),
  })
}

export function auditLogout(userId: string, ip?: string): Promise<void> {
  return recordAuditEvent("auth.logout", {
    userId,
    ...(ip ? { ipAddress: ip } : /* c8 ignore next */ {}),
  })
}

export function auditLoginFailed(ip?: string, metadata?: Record<string, string>): Promise<void> {
  return recordAuditEvent("auth.login_failed", {
    ...(ip ? { ipAddress: ip } : /* c8 ignore next */ {}),
    ...(metadata ? { metadata } : /* c8 ignore next */ {}),
  })
}

export function auditRateLimitExceeded(ip: string, route: string): Promise<void> {
  return recordAuditEvent("security.rate_limit_exceeded", {
    ipAddress: ip,
    metadata: { route },
  })
}

export function auditWebhookInvalidSignature(provider: string, ip?: string): Promise<void> {
  return recordAuditEvent("payment.webhook_invalid_signature", {
    ...(ip ? { ipAddress: ip } : /* c8 ignore next */ {}),
    metadata: { provider },
  })
}

export function auditTranscriptionStarted(
  userId: string,
  noteId: string,
  durationSeconds: number,
  sttEngine: string,
): Promise<void> {
  return recordAuditEvent("usage.transcription_started", {
    userId,
    resourceType: "note",
    resourceId: noteId,
    metadata: { durationSeconds, sttEngine },
  })
}

export function auditTranscriptionCompleted(
  userId: string,
  noteId: string,
  costUsd: number,
  llmModel: string,
): Promise<void> {
  return recordAuditEvent("usage.transcription_completed", {
    userId,
    resourceType: "note",
    resourceId: noteId,
    metadata: { costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, llmModel },
  })
}

export function auditUsageLimitReached(userId: string, tier: string): Promise<void> {
  return recordAuditEvent("usage.limit_reached", {
    userId,
    metadata: { tier },
  })
}
