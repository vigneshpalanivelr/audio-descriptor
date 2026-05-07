import { describe, it, expect, vi, beforeEach } from "vitest"

describe("resolveRazorpayAmount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("returns correct amount for starter tier", async () => {
    const { resolveRazorpayAmount } = await import("@/lib/payments/razorpay")
    expect(resolveRazorpayAmount("starter")).toBe(49_900)
  })

  it("returns correct amount for pro tier", async () => {
    const { resolveRazorpayAmount } = await import("@/lib/payments/razorpay")
    expect(resolveRazorpayAmount("pro")).toBe(99_900)
  })

  it("returns correct amount for pro_plus_local tier", async () => {
    const { resolveRazorpayAmount } = await import("@/lib/payments/razorpay")
    expect(resolveRazorpayAmount("pro_plus_local")).toBe(199_900)
  })

  it("returns null for free tier (not purchasable)", async () => {
    const { resolveRazorpayAmount } = await import("@/lib/payments/razorpay")
    expect(resolveRazorpayAmount("free")).toBeNull()
  })
})

describe("resolveTierFromRazorpayPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("RAZORPAY_PLAN_STARTER", "plan_starter_123")
    vi.stubEnv("RAZORPAY_PLAN_PRO", "plan_pro_456")
    vi.stubEnv("RAZORPAY_PLAN_PRO_PLUS_LOCAL", "plan_prolocal_789")
  })

  it("resolves starter plan ID to starter tier", async () => {
    const { resolveTierFromRazorpayPlan } = await import("@/lib/payments/razorpay")
    expect(resolveTierFromRazorpayPlan("plan_starter_123")).toBe("starter")
  })

  it("resolves pro plan ID to pro tier", async () => {
    const { resolveTierFromRazorpayPlan } = await import("@/lib/payments/razorpay")
    expect(resolveTierFromRazorpayPlan("plan_pro_456")).toBe("pro")
  })

  it("resolves pro_plus_local plan ID to pro_plus_local tier", async () => {
    const { resolveTierFromRazorpayPlan } = await import("@/lib/payments/razorpay")
    expect(resolveTierFromRazorpayPlan("plan_prolocal_789")).toBe("pro_plus_local")
  })

  it("returns null for unknown plan ID", async () => {
    const { resolveTierFromRazorpayPlan } = await import("@/lib/payments/razorpay")
    expect(resolveTierFromRazorpayPlan("plan_unknown")).toBeNull()
  })

  it("returns null when env vars are not set", async () => {
    vi.stubEnv("RAZORPAY_PLAN_STARTER", "")
    vi.stubEnv("RAZORPAY_PLAN_PRO", "")
    vi.stubEnv("RAZORPAY_PLAN_PRO_PLUS_LOCAL", "")
    const { resolveTierFromRazorpayPlan } = await import("@/lib/payments/razorpay")
    expect(resolveTierFromRazorpayPlan("plan_starter_123")).toBeNull()
  })
})
