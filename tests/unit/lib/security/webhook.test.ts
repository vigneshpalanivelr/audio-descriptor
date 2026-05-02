import { describe, it, expect } from "vitest"
import { verifyRazorpaySignature, verifyLemonSqueezySignature } from "@/lib/security/webhook"
import crypto from "crypto"

const SECRET = "test-webhook-secret-32-chars-long!!"
const BODY = JSON.stringify({ event: "payment.captured", id: "pay_123" })

function makeSignature(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex")
}

describe("verifyRazorpaySignature", () => {
  it("returns true for a valid HMAC signature", () => {
    const sig = makeSignature(BODY, SECRET)
    expect(verifyRazorpaySignature(BODY, sig, SECRET)).toBe(true)
  })

  it("returns false when signature is null (spoofed request with no header)", () => {
    expect(verifyRazorpaySignature(BODY, null, SECRET)).toBe(false)
  })

  it("returns false for a forged signature (attack: wrong HMAC)", () => {
    const forged = "deadbeef".repeat(8)
    expect(verifyRazorpaySignature(BODY, forged, SECRET)).toBe(false)
  })

  it("returns false when body is tampered after signing (replay with modified body)", () => {
    const sig = makeSignature(BODY, SECRET)
    const tamperedBody = BODY.replace("pay_123", "pay_999")
    expect(verifyRazorpaySignature(tamperedBody, sig, SECRET)).toBe(false)
  })

  it("returns false for empty signature string", () => {
    expect(verifyRazorpaySignature(BODY, "", SECRET)).toBe(false)
  })

  it("returns false when signature has wrong byte length (timingSafeEqual would throw)", () => {
    // A 10-char hex string has different byte length than the 64-char HMAC-SHA256 output
    expect(verifyRazorpaySignature(BODY, "abc123", SECRET)).toBe(false)
  })
})

describe("verifyLemonSqueezySignature", () => {
  it("returns true for a valid raw HMAC signature (no prefix)", () => {
    const sig = makeSignature(BODY, SECRET)
    expect(verifyLemonSqueezySignature(BODY, sig, SECRET)).toBe(true)
  })

  it("returns true for a valid signature with 'sha256=' prefix (LemonSqueezy wire format)", () => {
    const hex = makeSignature(BODY, SECRET)
    expect(verifyLemonSqueezySignature(BODY, `sha256=${hex}`, SECRET)).toBe(true)
  })

  it("returns false when signature is null", () => {
    expect(verifyLemonSqueezySignature(BODY, null, SECRET)).toBe(false)
  })

  it("returns false for a forged raw signature", () => {
    const forged = "00".repeat(32)
    expect(verifyLemonSqueezySignature(BODY, forged, SECRET)).toBe(false)
  })

  it("returns false for a forged signature with sha256= prefix", () => {
    expect(verifyLemonSqueezySignature(BODY, "sha256=" + "00".repeat(32), SECRET)).toBe(false)
  })

  it("returns false when body tampered (sha256= prefix preserved)", () => {
    const hex = makeSignature(BODY, SECRET)
    const tampered = BODY.replace("pay_123", "pay_EVIL")
    expect(verifyLemonSqueezySignature(tampered, `sha256=${hex}`, SECRET)).toBe(false)
  })

  it("returns false when only the prefix 'sha256=' is sent with no hex", () => {
    expect(verifyLemonSqueezySignature(BODY, "sha256=", SECRET)).toBe(false)
  })
})
