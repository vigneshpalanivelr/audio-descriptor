import type { UserTier } from "@/types"

function getVariantEnvMap(): Map<string, UserTier> {
  const m = new Map<string, UserTier>()
  /* c8 ignore next 3 */
  const starter = process.env["LEMONSQUEEZY_VARIANT_STARTER"] ?? ""
  const pro = process.env["LEMONSQUEEZY_VARIANT_PRO"] ?? ""
  const proLocal = process.env["LEMONSQUEEZY_VARIANT_PRO_PLUS_LOCAL"] ?? ""
  if (starter) m.set(starter, "starter")
  if (pro) m.set(pro, "pro")
  if (proLocal) m.set(proLocal, "pro_plus_local")
  return m
}

export function resolveTierFromLSVariant(variantId: number | string): UserTier | null {
  return getVariantEnvMap().get(String(variantId)) ?? null
}

// Extract variant_id from a LemonSqueezy webhook payload (order or subscription)
export function extractLSVariantId(payload: Record<string, unknown>): string | null {
  const data = payload["data"] as Record<string, unknown> | undefined
  const attrs = data?.["attributes"] as Record<string, unknown> | undefined
  if (!attrs) return null
  const variantId = attrs["variant_id"]
  if (variantId === null || variantId === undefined) return null
  return String(variantId)
}

// Extract a stable event ID for idempotency (prefer webhook_id, fall back to data.id)
export function extractLSEventId(payload: Record<string, unknown>): string | null {
  const meta = payload["meta"] as Record<string, unknown> | undefined
  const webhookId = meta?.["webhook_id"]
  if (webhookId) return String(webhookId)
  const dataId = (payload["data"] as Record<string, unknown> | undefined)?.["id"]
  return dataId ? String(dataId) : null
}
