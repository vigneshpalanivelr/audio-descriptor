import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { verifyLemonSqueezySignature } from "@/lib/security/webhook"
import {
  resolveTierFromLSVariant,
  extractLSVariantId,
  extractLSEventId,
} from "@/lib/payments/lemonsqueezy"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { appLogger } from "@/lib/logger"
import { recordAuditEvent } from "@/lib/logger/audit"
import type { UserTier } from "@/types"

const HANDLED_EVENTS = new Set(["order_created", "subscription_created", "subscription_updated"])

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-signature")
    const secret = process.env["LEMONSQUEEZY_WEBHOOK_SECRET"] ?? ""

    if (!verifyLemonSqueezySignature(rawBody, signature, secret)) {
      await recordAuditEvent("payment.webhook_invalid_signature", {
        metadata: { provider: "lemonsqueezy" },
      })
      return API_ERRORS.forbidden()
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const meta = payload["meta"] as Record<string, unknown> | undefined
    const event = meta?.["event_name"] as string | undefined

    if (!event || !HANDLED_EVENTS.has(event)) {
      return Response.json({ received: true })
    }

    const variantId = extractLSVariantId(payload)
    const eventId = extractLSEventId(payload)
    const userId = (meta?.["custom_data"] as Record<string, unknown> | undefined)?.["user_id"] as
      | string
      | undefined
    const tier = variantId ? resolveTierFromLSVariant(variantId) : null

    const db = createServiceClient()

    const { error: insertErr } = await db.from("payment_events").insert({
      user_id: userId ?? null,
      provider: "lemonsqueezy",
      event_type: event,
      external_event_id: eventId,
      payload: payload as Record<string, unknown>,
    })

    if (insertErr?.code === "23505") {
      return Response.json({ received: true })
    }

    if (insertErr) {
      appLogger.error({ err: insertErr, event }, "ls_webhook:insert_failed")
      return API_ERRORS.internalError()
    }

    if (userId && tier) {
      const lsSubscriptionId = (payload["data"] as Record<string, unknown> | undefined)?.["id"] as
        | string
        | undefined

      await db
        .from("profiles")
        .update({
          tier: tier satisfies UserTier,
          subscription_status: "active",
          subscription_provider: "lemonsqueezy",
          ...(lsSubscriptionId ? { subscription_ref: lsSubscriptionId } : {}),
        })
        .eq("id", userId)

      await recordAuditEvent("payment.subscription_started", {
        userId,
        metadata: { provider: "lemonsqueezy", tier, event, variantId: variantId ?? "" },
      })
    }

    return Response.json({ received: true })
  } catch (err) {
    return handleRouteError(err, "api/payments/lemonsqueezy/webhook")
  }
}
