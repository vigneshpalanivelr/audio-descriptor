import { describe, it, expect, vi, beforeEach } from "vitest"

describe("parseCostCap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("returns 20 when DAILY_COST_CAP_USD is not set", async () => {
    vi.stubEnv("DAILY_COST_CAP_USD", "")
    const { parseCostCap } = await import("@/lib/cost/cap")
    expect(parseCostCap()).toBe(20)
  })

  it("parses a valid numeric value", async () => {
    vi.stubEnv("DAILY_COST_CAP_USD", "50")
    const { parseCostCap } = await import("@/lib/cost/cap")
    expect(parseCostCap()).toBe(50)
  })

  it("returns 20 for non-numeric string", async () => {
    vi.stubEnv("DAILY_COST_CAP_USD", "not-a-number")
    const { parseCostCap } = await import("@/lib/cost/cap")
    expect(parseCostCap()).toBe(20)
  })

  it("returns 20 for zero value", async () => {
    vi.stubEnv("DAILY_COST_CAP_USD", "0")
    const { parseCostCap } = await import("@/lib/cost/cap")
    expect(parseCostCap()).toBe(20)
  })

  it("returns 20 for negative value", async () => {
    vi.stubEnv("DAILY_COST_CAP_USD", "-5")
    const { parseCostCap } = await import("@/lib/cost/cap")
    expect(parseCostCap()).toBe(20)
  })

  it("parses decimal values", async () => {
    vi.stubEnv("DAILY_COST_CAP_USD", "9.99")
    const { parseCostCap } = await import("@/lib/cost/cap")
    expect(parseCostCap()).toBeCloseTo(9.99)
  })
})

describe("isCostCapExceeded", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("returns false when spend is below cap", async () => {
    const { isCostCapExceeded } = await import("@/lib/cost/cap")
    expect(isCostCapExceeded(5, 20)).toBe(false)
  })

  it("returns true when spend exactly equals cap", async () => {
    const { isCostCapExceeded } = await import("@/lib/cost/cap")
    expect(isCostCapExceeded(20, 20)).toBe(true)
  })

  it("returns true when spend exceeds cap", async () => {
    const { isCostCapExceeded } = await import("@/lib/cost/cap")
    expect(isCostCapExceeded(25, 20)).toBe(true)
  })

  it("returns false when cap is 0 (disabled)", async () => {
    const { isCostCapExceeded } = await import("@/lib/cost/cap")
    expect(isCostCapExceeded(100, 0)).toBe(false)
  })

  it("returns false when spend is 0", async () => {
    const { isCostCapExceeded } = await import("@/lib/cost/cap")
    expect(isCostCapExceeded(0, 20)).toBe(false)
  })
})
