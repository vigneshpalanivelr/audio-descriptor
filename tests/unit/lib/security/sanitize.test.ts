import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  uuidSchema,
  languageCodeSchema,
  isAllowedAudioMimeType,
  sanitizeText,
  validateAudioUrl,
  isSafeRedirectPath,
  ALLOWED_AUDIO_MIME_TYPES,
} from "@/lib/security/sanitize"

describe("uuidSchema (attack: path traversal via note ID)", () => {
  it("accepts a valid UUID", () => {
    expect(() => uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).not.toThrow()
  })

  it("rejects path traversal string", () => {
    expect(() => uuidSchema.parse("../../etc/passwd")).toThrow()
  })

  it("rejects SQL injection string", () => {
    expect(() => uuidSchema.parse("'; DROP TABLE notes;--")).toThrow()
  })

  it("rejects empty string", () => {
    expect(() => uuidSchema.parse("")).toThrow()
  })

  it("rejects a plain integer", () => {
    expect(() => uuidSchema.parse("123")).toThrow()
  })
})

describe("languageCodeSchema", () => {
  it("accepts valid BCP-47 codes", () => {
    expect(() => languageCodeSchema.parse("en")).not.toThrow()
    expect(() => languageCodeSchema.parse("hi")).not.toThrow()
    expect(() => languageCodeSchema.parse("pt-BR")).not.toThrow()
  })

  it("rejects script injection in language code", () => {
    expect(() => languageCodeSchema.parse("<script>alert(1)</script>")).toThrow()
  })

  it("rejects excessively long input", () => {
    expect(() => languageCodeSchema.parse("a".repeat(20))).toThrow()
  })
})

describe("isAllowedAudioMimeType (attack: malicious file upload)", () => {
  it("accepts valid audio MIME types", () => {
    expect(isAllowedAudioMimeType("audio/webm")).toBe(true)
    expect(isAllowedAudioMimeType("audio/mp4")).toBe(true)
    expect(isAllowedAudioMimeType("audio/webm;codecs=opus")).toBe(true)
  })

  it("rejects .exe disguised with audio MIME type prefix injection", () => {
    expect(isAllowedAudioMimeType("application/octet-stream")).toBe(false)
    expect(isAllowedAudioMimeType("application/x-msdownload")).toBe(false)
  })

  it("rejects HTML/script MIME types", () => {
    expect(isAllowedAudioMimeType("text/html")).toBe(false)
    expect(isAllowedAudioMimeType("application/javascript")).toBe(false)
  })

  it("rejects empty MIME type", () => {
    expect(isAllowedAudioMimeType("")).toBe(false)
  })

  it("covers all entries in ALLOWED_AUDIO_MIME_TYPES", () => {
    for (const mime of ALLOWED_AUDIO_MIME_TYPES) {
      expect(isAllowedAudioMimeType(mime)).toBe(true)
    }
  })
})

describe("sanitizeText (attack: XSS + BiDi trojan source)", () => {
  // BiDi code points expressed as String.fromCodePoint to avoid literal chars in source
  const LRE = String.fromCodePoint(0x202a) // LEFT-TO-RIGHT EMBEDDING
  const RLE = String.fromCodePoint(0x202b) // RIGHT-TO-LEFT EMBEDDING
  const PDF = String.fromCodePoint(0x202c) // POP DIRECTIONAL FORMATTING
  const LRO = String.fromCodePoint(0x202d) // LEFT-TO-RIGHT OVERRIDE
  const RLO = String.fromCodePoint(0x202e) // RIGHT-TO-LEFT OVERRIDE
  const LRI = String.fromCodePoint(0x2066) // LEFT-TO-RIGHT ISOLATE
  const RLI = String.fromCodePoint(0x2067) // RIGHT-TO-LEFT ISOLATE
  const FSI = String.fromCodePoint(0x2068) // FIRST STRONG ISOLATE
  const PDI = String.fromCodePoint(0x2069) // POP DIRECTIONAL ISOLATE
  const LRM = String.fromCodePoint(0x200e) // LEFT-TO-RIGHT MARK
  const RLM = String.fromCodePoint(0x200f) // RIGHT-TO-LEFT MARK

  it("passes through clean text unchanged", () => {
    expect(sanitizeText("Hello world")).toBe("Hello world")
  })

  it("strips null bytes (attack: null byte injection)", () => {
    expect(sanitizeText("hello\x00world")).toBe("helloworld")
  })

  it("strips control characters", () => {
    expect(sanitizeText("hello\x01\x02world")).toBe("helloworld")
  })

  it("preserves newlines (valid in notes)", () => {
    expect(sanitizeText("line1\nline2")).toBe("line1\nline2")
  })

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello")
  })

  it("strips U+202E RIGHT-TO-LEFT OVERRIDE (BiDi trojan-source attack)", () => {
    expect(sanitizeText(`admin${RLO}tenroc`)).toBe("admintenroc")
  })

  it("strips all BiDi embedding/override/isolate/mark characters", () => {
    for (const c of [LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI, LRM, RLM]) {
      expect(sanitizeText(`hello${c}world`)).toBe("helloworld")
    }
  })
})

describe("validateAudioUrl (attack: SSRF via audio URL)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
  })

  it("accepts a valid Supabase storage URL", () => {
    expect(
      validateAudioUrl("http://localhost:54321/storage/v1/object/public/audio/user123/clip.webm"),
    ).toBe(true)
  })

  it("accepts HTTPS Supabase storage URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co")
    expect(
      validateAudioUrl("https://abc.supabase.co/storage/v1/object/public/audio/clip.webm"),
    ).toBe(true)
  })

  it("blocks AWS IMDS metadata endpoint (SSRF attack)", () => {
    expect(validateAudioUrl("http://169.254.169.254/latest/meta-data/")).toBe(false) // eslint-disable-line sonarjs/no-clear-text-protocols
  })

  it("blocks arbitrary external URL (SSRF attack)", () => {
    expect(validateAudioUrl("https://evil.com/malware.exe")).toBe(false)
  })

  it("blocks internal service URL (SSRF via internal network)", () => {
    expect(validateAudioUrl("http://localhost:8080/internal/secret")).toBe(false)
  })

  it("blocks URL that has correct host but wrong path (not storage)", () => {
    expect(validateAudioUrl("http://localhost:54321/rest/v1/profiles")).toBe(false)
  })

  it("blocks empty string", () => {
    expect(validateAudioUrl("")).toBe(false)
  })

  it("blocks relative path", () => {
    expect(validateAudioUrl("/storage/v1/object/public/audio/clip.webm")).toBe(false)
  })

  it("blocks javascript: protocol", () => {
    expect(validateAudioUrl("javascript:alert(1)")).toBe(false)
  })

  it("returns false when NEXT_PUBLIC_SUPABASE_URL is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    expect(
      validateAudioUrl("http://localhost:54321/storage/v1/object/public/audio/clip.webm"),
    ).toBe(false)
  })
})

describe("isSafeRedirectPath (attack: open redirect)", () => {
  it("accepts a simple relative path", () => {
    expect(isSafeRedirectPath("/notes")).toBe(true)
  })

  it("accepts a nested relative path", () => {
    expect(isSafeRedirectPath("/notes/abc-123")).toBe(true)
  })

  it("accepts root path", () => {
    expect(isSafeRedirectPath("/")).toBe(true)
  })

  it("blocks protocol-relative URL (attack: //evil.com)", () => {
    expect(isSafeRedirectPath("//evil.com/steal")).toBe(false)
  })

  it("blocks absolute HTTPS URL (attack: https://phishing.com)", () => {
    expect(isSafeRedirectPath("https://phishing.com")).toBe(false)
  })

  it("blocks absolute HTTP URL", () => {
    expect(isSafeRedirectPath("http://evil.com")).toBe(false) // eslint-disable-line sonarjs/no-clear-text-protocols
  })

  it("blocks empty string", () => {
    expect(isSafeRedirectPath("")).toBe(false)
  })

  it("blocks non-path string without leading slash", () => {
    expect(isSafeRedirectPath("notes")).toBe(false)
  })

  it("blocks javascript: protocol attempt", () => {
    expect(isSafeRedirectPath("javascript:alert(1)")).toBe(false)
  })

  it("blocks path with embedded protocol (attack: /path://evil.com)", () => {
    expect(isSafeRedirectPath("/foo://bar")).toBe(false)
  })
})
