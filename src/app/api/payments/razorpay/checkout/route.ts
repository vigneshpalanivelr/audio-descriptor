import { NextRequest } from "next/server"
import { z } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { resolveRazorpayAmount } from "@/lib/payments/razorpay"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { recordAuditEvent } from "@/lib/logger/audit"

const checkoutSchema = z.object({
  tier: z.enum(["starter", "pro", "pro_plus_local"]),
})

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const body = await request.json()
    const { tier } = checkoutSchema.parse(body)

    const amount = resolveRazorpayAmount(tier)
    if (!amount) return API_ERRORS.invalidInput({ tier: ["Unknown tier"] })

    const keyId = process.env["RAZORPAY_KEY_ID"] ?? ""
    const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? ""
    if (!keyId || !keySecret) return API_ERRORS.serviceUnavailable("Razorpay")

    const rp = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await rp.orders.create({
      amount,
      currency: "INR",
      receipt: `qc-${user.id.slice(0, 8)}-${tier}`,
    })

    await recordAuditEvent("payment.subscription_started", {
      userId: user.id,
      metadata: { provider: "razorpay", tier, orderId: String(order.id) },
    })

    return Response.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: keyId,
    })
  } catch (err) {
    return handleRouteError(err, "api/payments/razorpay/checkout")
  }
}
