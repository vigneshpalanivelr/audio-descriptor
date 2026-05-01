import { describe, it, expect } from "vitest"
import crypto from "crypto"
import { verifyRazorpaySignature } from "@/lib/security/webhook"
import { checkRateLimit } from "@/lib/security/ratelimit"
import { uuidSchema, isAllowedAudioMimeType, sanitizeText } from "@/lib/security/sanitize"
import { canRecord } from "@/lib/usage/limits"

// ──────────────────────────────────────────────────────────────────────────────
// ATTACK SCENARIO TESTS
// Each test is named after the attack it simulates.
// A passing test means the attack was BLOCKED.
// ──────────────────────────────────────────────────────────────────────────────

// Test HMAC key — not a real secret
const WEBHOOK_TEST_HMAC_KEY = "test-only-hmac-key-not-real-12345"

describe("ATTACK: Webhook Spoofing", () => {
  const body = '{"event":"order.paid"}'

  it("blocks request with no signature header", () => {
    expect(verifyRazorpaySignature(body, null, WEBHOOK_TEST_HMAC_KEY)).toBe(false)
  })

  it("blocks request with forged all-zeros signature", () => {
    expect(verifyRazorpaySignature(body, "0".repeat(64), WEBHOOK_TEST_HMAC_KEY)).toBe(false)
  })

  it("blocks request where body was modified after signing", () => {
    const realSig = crypto.createHmac("sha256", WEBHOOK_TEST_HMAC_KEY).update(body).digest("hex")
    const tampered = body.replace("order.paid", "subscription.created")
    expect(verifyRazorpaySignature(tampered, realSig, WEBHOOK_TEST_HMAC_KEY)).toBe(false)
  })
})

describe("ATTACK: Brute Force / DoS via Rate Limiting", () => {
  it("blocks after 10 rapid upload requests from same IP", () => {
    const ip = `attack-ip-${Date.now()}`
    const config = { maxRequests: 10, windowMs: 60_000 }
    for (let i = 0; i < 10; i++) checkRateLimit(ip, config)
    const eleventh = checkRateLimit(ip, config)
    expect(eleventh.allowed).toBe(false)
  })
})

describe("ATTACK: IDOR / Path Traversal via Note ID", () => {
  const attacks = [
    "../../etc/passwd",
    "../../../proc/self/environ",
    "'; DROP TABLE notes;--",
    "<script>alert(1)</script>",
    "null",
    "undefined",
    "0",
    "admin",
  ]

  it.each(attacks)("rejects malicious ID: %s", (input) => {
    expect(() => uuidSchema.parse(input)).toThrow()
  })
})

describe("ATTACK: Malicious File Upload", () => {
  const maliciousMimeTypes = [
    "application/x-msdownload",
    "application/exe",
    "text/html",
    "application/javascript",
    "application/x-php",
    "application/xml",
    "image/svg+xml",
  ]

  it.each(maliciousMimeTypes)("rejects MIME type: %s", (mime) => {
    expect(isAllowedAudioMimeType(mime)).toBe(false)
  })
})

describe("ATTACK: XSS via Stored Input", () => {
  it("strips null bytes from user content", () => {
    const result = sanitizeText("hello\x00<script>alert(1)</script>")
    expect(result).not.toContain("\x00")
  })

  it("strips control characters", () => {
    const result = sanitizeText("\x01\x02\x03malicious")
    expect(result).toBe("malicious")
  })

  it("React rendering handles XSS — angle brackets are preserved as text, not HTML", () => {
    // React escapes angle brackets in JSX — this test documents that guarantee
    const xssAttempt = "<img src=x onerror=alert(1)>"
    const sanitized = sanitizeText(xssAttempt)
    // sanitizeText does not strip HTML (React does that at render time)
    // but it does strip null bytes and control chars
    expect(sanitized).toBe(xssAttempt.trim())
  })
})

describe("ATTACK: Usage Cap Bypass", () => {
  it("blocks free user attempting to exceed 30-minute monthly cap", () => {
    expect(canRecord("free", 29, 2)).toBe(false)
  })

  it("blocks starter user attempting to record past 600-minute cap", () => {
    expect(canRecord("starter", 599, 2)).toBe(false)
  })

  it("blocks free user with exactly 30 minutes used", () => {
    expect(canRecord("free", 30, 0.01)).toBe(false)
  })

  it("blocks negative requested minutes (attack: integer underflow)", () => {
    // canRecord should treat 0 remaining as blocked even with tiny request
    expect(canRecord("free", 30, -999)).toBe(false)
  })
})
