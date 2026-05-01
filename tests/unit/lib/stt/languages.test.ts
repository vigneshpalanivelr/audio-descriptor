import { describe, it, expect } from "vitest"
import { isIndianLanguage, INDIAN_LANGUAGES } from "@/lib/stt/languages"

describe("isIndianLanguage", () => {
  it("returns true for all defined Indian language codes", () => {
    for (const lang of INDIAN_LANGUAGES) {
      expect(isIndianLanguage(lang)).toBe(true)
    }
  })

  it("returns true for uppercase variants (normalised)", () => {
    expect(isIndianLanguage("HI")).toBe(true)
    expect(isIndianLanguage("TA")).toBe(true)
  })

  it("returns false for English", () => {
    expect(isIndianLanguage("en")).toBe(false)
  })

  it("returns false for unknown language code", () => {
    expect(isIndianLanguage("xx")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isIndianLanguage("")).toBe(false)
  })
})
