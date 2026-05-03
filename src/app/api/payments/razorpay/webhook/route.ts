import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { verifyRazorpaySignature } from "@/lib/security/webhook"
import { resolveTierFromRazorpayPlan } from "@/lib/payments/razorpay"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { appLogger } from "@/lib/logger"
import { recordAuditEvent } from "@/lib/logger/audit"
import type { UserTier } from "@/types"

const HANDLED_EVENTS = new Set([
  "subscription.activated",
  "subscription.charged",
  "payment.captured",
])

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-razorpay-signature")
    const secret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? ""

    if (!verifyRazorpaySignature(rawBody, signature, secret)) {
      await recordAuditEvent("payment.webhook_invalid_signature", {
        metadata: { provider: "razorpay" },
      })
      return API_ERRORS.forbidden()
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const event = payload["event"] as string | undefined

    if (!event || !HANDLED_EVENTS.has(event)) {
      return Response.json({ received: true })
    }

    const entity = payload["payload"] as Record<string, unknown> | undefined
    const subscription = (entity?.["subscription"] as Record<string, unknown> | undefined)?.[
      "entity"
    ] as Record<string, unknown> | undefined
    const payment = (entity?.["payment"] as Record<string, unknown> | undefined)?.["entity"] as
      | Record<string, unknown>
      | undefined

    const planId = (subscription?.["plan_id"] ?? payment?.["plan_id"] ?? "") as string
    const subscriptionId = (subscription?.["id"] ?? payment?.["subscription_id"] ?? "") as string
    const subNotes = subscription?.["notes"] as Record<string, unknown> | undefined
    const payNotes = payment?.["notes"] as Record<string, unknown> | undefined
    const userId = (subNotes?.["user_id"] ?? payNotes?.["user_id"] ?? "") as string

    const tier = resolveTierFromRazorpayPlan(planId)
    const externalEventId = `rp-${event}-${subscriptionId}`

    const db = createServiceClient()

    // Idempotency check — unique constraint on external_event_id
    const { error: insertErr } = await db.from("payment_events").insert({
      user_id: userId || null,
      provider: "razorpay",
      event_type: event,
      external_event_id: externalEventId,
      payload: payload as Record<string, unknown>,
    })

    if (insertErr?.code === "23505") {
      // Duplicate — already processed
      return Response.json({ received: true })
    }

    if (insertErr) {
      appLogger.error({ err: insertErr, event }, "razorpay_webhook:insert_failed")
      return API_ERRORS.internalError()
    }

    if (userId && tier) {
      await db
        .from("profiles")
        .update({
          tier: tier satisfies UserTier,
          subscription_status: "active",
          subscription_provider: "razorpay",
          subscription_ref: subscriptionId,
        })
        .eq("id", userId)

      await recordAuditEvent("payment.subscription_started", {
        userId,
        metadata: { provider: "razorpay", tier, event, subscriptionId },
      })
    }

    return Response.json({ received: true })
  } catch (err) {
    return handleRouteError(err, "api/payments/razorpay/webhook")
  }
}
