import { describe, it, expect } from "vitest"
import {
  uuidSchema,
  languageCodeSchema,
  isAllowedAudioMimeType,
  sanitizeText,
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

describe("sanitizeText (attack: XSS via stored input)", () => {
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
})
