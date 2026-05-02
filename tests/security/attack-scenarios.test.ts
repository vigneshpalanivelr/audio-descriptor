import { describe, it, expect, vi, beforeEach } from "vitest"
import crypto from "crypto"
import { verifyRazorpaySignature } from "@/lib/security/webhook"
import { checkRateLimit } from "@/lib/security/ratelimit"
import {
  uuidSchema,
  isAllowedAudioMimeType,
  sanitizeText,
  validateAudioUrl,
  isSafeRedirectPath,
} from "@/lib/security/sanitize"
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
    expect(sanitized).toBe(xssAttempt.trim())
  })
})

describe("ATTACK: BiDi Trojan Source (disguising malicious content in logs/UI)", () => {
  // Code point constants avoid literal BiDi chars in test source
  const RLO = String.fromCodePoint(0x202e) // RIGHT-TO-LEFT OVERRIDE
  const LRE = String.fromCodePoint(0x202a) // LEFT-TO-RIGHT EMBEDDING
  const RLE = String.fromCodePoint(0x202b) // RIGHT-TO-LEFT EMBEDDING
  const LRI = String.fromCodePoint(0x2066) // LEFT-TO-RIGHT ISOLATE
  const RLI = String.fromCodePoint(0x2067) // RIGHT-TO-LEFT ISOLATE
  const FSI = String.fromCodePoint(0x2068) // FIRST STRONG ISOLATE
  const PDI = String.fromCodePoint(0x2069) // POP DIRECTIONAL ISOLATE

  it("strips U+202E (RLO) used to disguise filenames/log entries", () => {
    // Attacker encodes "gpj.exe" as "exe<RLO>gpj" — visually appears as "exe.gpj" but is .exe
    const input = `exe${RLO}gpj`
    const result = sanitizeText(input)
    expect(result).toBe("exegpj")
    expect(result).not.toContain(RLO)
  })

  it("strips U+202A (LRE) from user text", () => {
    expect(sanitizeText(`hello${LRE}world`)).toBe("helloworld")
  })

  it("strips U+202B (RLE) from user text", () => {
    expect(sanitizeText(`hello${RLE}world`)).toBe("helloworld")
  })

  it("strips all directional isolates (U+2066–U+2069)", () => {
    for (const c of [LRI, RLI, FSI, PDI]) {
      expect(sanitizeText(`attack${c}payload`)).toBe("attackpayload")
    }
  })
})

describe("ATTACK: SSRF via Audio URL", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
  })

  it("blocks AWS IMDS endpoint (cloud metadata SSRF)", () => {
    expect(
      validateAudioUrl("http://169.254.169.254/latest/meta-data/iam/security-credentials/"),
    ).toBe(false) // eslint-disable-line sonarjs/no-clear-text-protocols
  })

  it("blocks GCP metadata endpoint", () => {
    expect(validateAudioUrl("http://metadata.google.internal/computeMetadata/v1/")).toBe(false) // eslint-disable-line sonarjs/no-clear-text-protocols
  })

  it("blocks localhost Redis port (port-scan via SSRF)", () => {
    expect(validateAudioUrl("http://localhost:6379/")).toBe(false)
  })

  it("blocks localhost Postgres port (port-scan via SSRF)", () => {
    expect(validateAudioUrl("http://127.0.0.1:5432/")).toBe(false)
  })

  it("blocks external CDN URL (not Supabase storage)", () => {
    expect(validateAudioUrl("https://cdn.attacker.com/malware.mp3")).toBe(false)
  })

  it("allows only valid Supabase storage URLs", () => {
    expect(
      validateAudioUrl("http://localhost:54321/storage/v1/object/public/audio/u1/clip.webm"),
    ).toBe(true)
  })
})

describe("ATTACK: Open Redirect via ?next= parameter", () => {
  it("blocks //evil.com (protocol-relative redirect)", () => {
    expect(isSafeRedirectPath("//evil.com/phishing")).toBe(false)
  })

  it("blocks https://phishing.com", () => {
    expect(isSafeRedirectPath("https://phishing.com")).toBe(false)
  })

  it("blocks http:// absolute URL", () => {
    expect(isSafeRedirectPath("http://evil.com")).toBe(false) // eslint-disable-line sonarjs/no-clear-text-protocols
  })

  it("allows /notes (safe relative path)", () => {
    expect(isSafeRedirectPath("/notes")).toBe(true)
  })

  it("allows /auth/callback (safe relative path)", () => {
    expect(isSafeRedirectPath("/auth/callback")).toBe(true)
  })

  it("blocks empty string", () => {
    expect(isSafeRedirectPath("")).toBe(false)
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
    expect(canRecord("free", 30, -999)).toBe(false)
  })
})
