import { describe, it, expect } from "vitest"
import {
  getRemainingMinutes,
  canRecord,
  getNoteDurationLimit,
  TIER_MONTHLY_LIMITS,
  TIER_NOTE_DURATION_LIMITS,
  usageCheckSchema,
} from "@/lib/usage/limits"

describe("getRemainingMinutes", () => {
  it("returns correct remaining for free tier", () => {
    expect(getRemainingMinutes("free", 10)).toBe(20)
  })

  it("returns 0 when limit is exactly exhausted (attack: quota bypass edge case)", () => {
    expect(getRemainingMinutes("free", 30)).toBe(0)
  })

  it("returns 0 — never negative — when over limit", () => {
    expect(getRemainingMinutes("free", 999)).toBe(0)
  })

  it("returns Infinity for pro tier (unlimited)", () => {
    expect(getRemainingMinutes("pro", 10_000)).toBe(Infinity)
  })

  it("returns Infinity for pro_plus_local tier", () => {
    expect(getRemainingMinutes("pro_plus_local", 10_000)).toBe(Infinity)
  })
})

describe("canRecord (attack: usage cap bypass)", () => {
  it("allows recording within limit", () => {
    expect(canRecord("free", 25, 4)).toBe(true)
  })

  it("blocks when usage exactly meets limit (boundary)", () => {
    expect(canRecord("free", 30, 1)).toBe(false)
  })

  it("blocks a large request that would exceed limit", () => {
    expect(canRecord("starter", 595, 10)).toBe(false)
  })

  it("always allows pro tier regardless of usage", () => {
    expect(canRecord("pro", 99_999, 60)).toBe(true)
  })
})

describe("getNoteDurationLimit", () => {
  it("returns 5 for free tier", () => {
    expect(getNoteDurationLimit("free")).toBe(5)
  })

  it("returns 30 for starter tier", () => {
    expect(getNoteDurationLimit("starter")).toBe(30)
  })

  it("returns Infinity for pro", () => {
    expect(getNoteDurationLimit("pro")).toBe(Infinity)
  })
})

describe("TIER limits are consistent (all tiers defined)", () => {
  const tiers = ["free", "starter", "pro", "pro_plus_local"] as const
  it.each(tiers)("tier %s has monthly limit defined", (tier) => {
    expect(TIER_MONTHLY_LIMITS[tier]).toBeDefined()
  })
  it.each(tiers)("tier %s has note duration limit defined", (tier) => {
    expect(TIER_NOTE_DURATION_LIMITS[tier]).toBeDefined()
  })
})

describe("usageCheckSchema (attack: input validation bypass)", () => {
  it("accepts valid duration", () => {
    expect(() => usageCheckSchema.parse({ durationSeconds: 300 })).not.toThrow()
  })

  it("rejects negative duration (attack: negative value injection)", () => {
    expect(() => usageCheckSchema.parse({ durationSeconds: -1 })).toThrow()
  })

  it("rejects zero duration", () => {
    expect(() => usageCheckSchema.parse({ durationSeconds: 0 })).toThrow()
  })

  it("rejects excessively large duration (attack: integer overflow / quota bypass)", () => {
    expect(() => usageCheckSchema.parse({ durationSeconds: 99_999_999 })).toThrow()
  })

  it("rejects non-integer duration (attack: float boundary abuse)", () => {
    expect(() => usageCheckSchema.parse({ durationSeconds: 1.5 })).toThrow()
  })
})
