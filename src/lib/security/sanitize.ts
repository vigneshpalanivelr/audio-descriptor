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
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? ""
  return ALLOWED_AUDIO_MIME_TYPES.has(normalized) || ALLOWED_AUDIO_MIME_TYPES.has(mimeType)
}

// Strip any non-printable characters from user-supplied text
export function sanitizeText(input: string): string {
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim()
}
