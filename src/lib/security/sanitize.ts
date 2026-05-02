import { z } from "zod"

// UUID validator — used to prevent path traversal via note IDs
export const uuidSchema = z.string().uuid("Invalid ID format")

// Language code validator (BCP-47 subset)
export const languageCodeSchema = z
  .string()
  // eslint-disable-next-line security/detect-unsafe-regex -- fixed-length quantifiers only; provably safe
  .regex(/^[a-z]{2,3}(-[A-Z]{2,3})?$/, "Invalid language code")
  .max(10)

// File size limit (bytes)
export const MAX_AUDIO_SIZE_FREE = 25 * 1024 * 1024 // 25 MB
export const MAX_AUDIO_SIZE_PRO = 100 * 1024 * 1024 // 100 MB

// Allowed audio MIME types
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/m4a",
  "audio/x-m4a",
])

export function isAllowedAudioMimeType(mimeType: string): boolean {
  // String.split always returns >=1 element — non-null assertion is safe
  const normalized = mimeType.toLowerCase().split(";")[0]!.trim()
  return ALLOWED_AUDIO_MIME_TYPES.has(normalized)
}

// BiDi override chars disguise malicious content in logs/UI (trojan-source attack).
// U+202A-202E: LRE RLE PDF LRO RLO, U+2066-2069: LRI RLI FSI PDI, U+200E/F: LRM/RLM
// eslint-disable-next-line security/detect-bidi-characters -- intentional: strips BiDi from user input
const BIDI_OVERRIDES_RE = /[‪-‮⁦-⁩‎‏]/g

// Strip non-printable + BiDi override characters from user-supplied text
export function sanitizeText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(BIDI_OVERRIDES_RE, "")
    .trim()
}

// Validates that an audio URL is from our own Supabase storage bucket.
// Prevents SSRF: only URLs on the same hostname as NEXT_PUBLIC_SUPABASE_URL
// pointing to /storage/v1/object/ are allowed.
export function validateAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const storageEnv = process.env["NEXT_PUBLIC_SUPABASE_URL"]
    if (!storageEnv) return false
    const storageHost = new URL(storageEnv).hostname
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname === storageHost &&
      parsed.pathname.startsWith("/storage/v1/object/")
    )
  } catch {
    return false
  }
}

// Validates that a redirect target is a safe relative path.
// Prevents open redirect via ?next=//evil.com or ?next=https://phishing.com.
export function isSafeRedirectPath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://")
  )
}
