import type { UserTier } from "@/types"

// Amount in paise (INR × 100)
export const RAZORPAY_TIER_PRICES: Map<UserTier, number> = new Map([
  ["starter", 49_900],
  ["pro", 99_900],
  ["pro_plus_local", 199_900],
])

function getPlanEnvMap(): Map<string, UserTier> {
  const m = new Map<string, UserTier>()
  /* c8 ignore next 3 */
  const starter = process.env["RAZORPAY_PLAN_STARTER"] ?? ""
  const pro = process.env["RAZORPAY_PLAN_PRO"] ?? ""
  const proLocal = process.env["RAZORPAY_PLAN_PRO_PLUS_LOCAL"] ?? ""
  if (starter) m.set(starter, "starter")
  if (pro) m.set(pro, "pro")
  if (proLocal) m.set(proLocal, "pro_plus_local")
  return m
}

export function resolveTierFromRazorpayPlan(planId: string): UserTier | null {
  return getPlanEnvMap().get(planId) ?? null
}

export function resolveRazorpayAmount(tier: UserTier): number | null {
  return RAZORPAY_TIER_PRICES.get(tier) ?? null
}
