import { z } from "zod"
import type { UserTier } from "@/types"

// Minutes allowed per month per tier
export const TIER_MONTHLY_LIMITS: Record<UserTier, number> = {
  free: 30,
  starter: 600,
  pro: Infinity,
  pro_plus_local: Infinity,
}

// Max recording duration per note (minutes)
export const TIER_NOTE_DURATION_LIMITS: Record<UserTier, number> = {
  free: 5,
  starter: 30,
  pro: Infinity,
  pro_plus_local: Infinity,
}

export function getRemainingMinutes(tier: UserTier, minutesUsed: number): number {
  // eslint-disable-next-line security/detect-object-injection -- tier is a validated UserTier union, not user input
  const limit = TIER_MONTHLY_LIMITS[tier]
  if (limit === Infinity) return Infinity
  return Math.max(0, limit - minutesUsed)
}

export function canRecord(tier: UserTier, minutesUsed: number, requestedMinutes: number): boolean {
  // Reject zero or negative values — prevents integer underflow attacks
  if (requestedMinutes <= 0) return false
  const remaining = getRemainingMinutes(tier, minutesUsed)
  return remaining >= requestedMinutes
}

export function getNoteDurationLimit(tier: UserTier): number {
  // eslint-disable-next-line security/detect-object-injection -- tier is a validated UserTier union, not user input
  return TIER_NOTE_DURATION_LIMITS[tier]
}

// Zod schema for validating the usage check request at API boundary
export const usageCheckSchema = z.object({
  durationSeconds: z.number().int().positive().max(5400), // max 90 min sanity cap
})
