import { describe, it, expect, vi, beforeEach } from "vitest"

describe("resolveTierFromLSVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LEMONSQUEEZY_VARIANT_STARTER", "111")
    vi.stubEnv("LEMONSQUEEZY_VARIANT_PRO", "222")
    vi.stubEnv("LEMONSQUEEZY_VARIANT_PRO_PLUS_LOCAL", "333")
  })

  it("resolves starter variant to starter tier", async () => {
    const { resolveTierFromLSVariant } = await import("@/lib/payments/lemonsqueezy")
    expect(resolveTierFromLSVariant("111")).toBe("starter")
  })

  it("resolves numeric variant ID", async () => {
    const { resolveTierFromLSVariant } = await import("@/lib/payments/lemonsqueezy")
    expect(resolveTierFromLSVariant(111)).toBe("starter")
  })

  it("resolves pro variant to pro tier", async () => {
    const { resolveTierFromLSVariant } = await import("@/lib/payments/lemonsqueezy")
    expect(resolveTierFromLSVariant("222")).toBe("pro")
  })

  it("resolves pro_plus_local variant", async () => {
    const { resolveTierFromLSVariant } = await import("@/lib/payments/lemonsqueezy")
    expect(resolveTierFromLSVariant("333")).toBe("pro_plus_local")
  })

  it("returns null for unknown variant", async () => {
    const { resolveTierFromLSVariant } = await import("@/lib/payments/lemonsqueezy")
    expect(resolveTierFromLSVariant("999")).toBeNull()
  })

  it("returns null when env vars are not set", async () => {
    vi.stubEnv("LEMONSQUEEZY_VARIANT_STARTER", "")
    vi.stubEnv("LEMONSQUEEZY_VARIANT_PRO", "")
    vi.stubEnv("LEMONSQUEEZY_VARIANT_PRO_PLUS_LOCAL", "")
    const { resolveTierFromLSVariant } = await import("@/lib/payments/lemonsqueezy")
    expect(resolveTierFromLSVariant("111")).toBeNull()
  })
})

describe("extractLSVariantId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("extracts variant_id from order payload", async () => {
    const { extractLSVariantId } = await import("@/lib/payments/lemonsqueezy")
    const payload = { data: { attributes: { variant_id: 222 } } }
    expect(extractLSVariantId(payload)).toBe("222")
  })

  it("returns null when data is missing", async () => {
    const { extractLSVariantId } = await import("@/lib/payments/lemonsqueezy")
    expect(extractLSVariantId({})).toBeNull()
  })

  it("returns null when attributes is missing", async () => {
    const { extractLSVariantId } = await import("@/lib/payments/lemonsqueezy")
    expect(extractLSVariantId({ data: {} })).toBeNull()
  })

  it("returns null when variant_id is null", async () => {
    const { extractLSVariantId } = await import("@/lib/payments/lemonsqueezy")
    expect(extractLSVariantId({ data: { attributes: { variant_id: null } } })).toBeNull()
  })
})

describe("extractLSEventId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("prefers webhook_id from meta", async () => {
    const { extractLSEventId } = await import("@/lib/payments/lemonsqueezy")
    const payload = { meta: { webhook_id: "wh_abc123" }, data: { id: "data_id" } }
    expect(extractLSEventId(payload)).toBe("wh_abc123")
  })

  it("falls back to data.id when webhook_id is absent", async () => {
    const { extractLSEventId } = await import("@/lib/payments/lemonsqueezy")
    const payload = { meta: {}, data: { id: "order_456" } }
    expect(extractLSEventId(payload)).toBe("order_456")
  })

  it("returns null when both are absent", async () => {
    const { extractLSEventId } = await import("@/lib/payments/lemonsqueezy")
    expect(extractLSEventId({})).toBeNull()
  })
})
