import crypto from "crypto"

function verifyHmacSha256(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  // timing-safe compare prevents timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    // Buffer lengths differ — signature is invalid
    return false
  }
}

export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  return verifyHmacSha256(rawBody, signature, secret)
}

export function verifyLemonSqueezySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  return verifyHmacSha256(rawBody, signature, secret)
}
