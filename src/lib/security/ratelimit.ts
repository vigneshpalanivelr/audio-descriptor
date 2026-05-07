// Simple in-memory rate limiter for Phase 1 local development.
// Replace with Vercel KV or Upstash Redis for production.

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

// Pre-configured limiters used across the app
export const RATE_LIMITS = {
  upload: { maxRequests: 10, windowMs: 60_000 } satisfies RateLimitConfig,
  signIn: { maxRequests: 5, windowMs: 60_000 } satisfies RateLimitConfig,
  signup: { maxRequests: 3, windowMs: 3_600_000 } satisfies RateLimitConfig,
  webhook: { maxRequests: 100, windowMs: 60_000 } satisfies RateLimitConfig,
  regenerate: { maxRequests: 5, windowMs: 60_000 } satisfies RateLimitConfig,
  checkout: { maxRequests: 3, windowMs: 60_000 } satisfies RateLimitConfig,
} as const
