import { describe, it, expect, beforeEach, vi } from "vitest"
import { checkRateLimit } from "@/lib/security/ratelimit"

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("allows requests under the limit", () => {
    const key = `test-${Date.now()}-allow`
    const config = { maxRequests: 3, windowMs: 60_000 }
    const r1 = checkRateLimit(key, config)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)
  })

  it("blocks request at the limit (attack: brute force)", () => {
    const key = `test-${Date.now()}-block`
    const config = { maxRequests: 2, windowMs: 60_000 }
    checkRateLimit(key, config) // 1st
    checkRateLimit(key, config) // 2nd — hits limit
    const r3 = checkRateLimit(key, config) // 3rd — should be blocked
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
  })

  it("resets after the window expires (attack: window boundary abuse)", () => {
    const key = `test-${Date.now()}-reset`
    const config = { maxRequests: 1, windowMs: 1_000 }
    checkRateLimit(key, config) // use up the allowance
    const blocked = checkRateLimit(key, config)
    expect(blocked.allowed).toBe(false)

    vi.advanceTimersByTime(1_001) // past the window
    const afterReset = checkRateLimit(key, config)
    expect(afterReset.allowed).toBe(true)
  })

  it("isolates rate limits per key (different IPs)", () => {
    const config = { maxRequests: 1, windowMs: 60_000 }
    const ts = Date.now()
    checkRateLimit(`ip-a-${ts}`, config)
    const blocked = checkRateLimit(`ip-a-${ts}`, config)
    const differentIp = checkRateLimit(`ip-b-${ts}`, config)
    expect(blocked.allowed).toBe(false)
    expect(differentIp.allowed).toBe(true)
  })
})
