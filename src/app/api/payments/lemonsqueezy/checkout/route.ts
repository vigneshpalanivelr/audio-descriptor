import { NextRequest } from "next/server"
import { z } from "zod"
import { lemonSqueezySetup, createCheckout } from "@lemonsqueezy/lemonsqueezy.js"
import { createClient } from "@/lib/supabase/server"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { recordAuditEvent } from "@/lib/logger/audit"
import { APP_CONFIG } from "@/config/app"

const checkoutSchema = z.object({
  variantId: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return API_ERRORS.unauthorized()

    const body = await request.json()
    const { variantId } = checkoutSchema.parse(body)

    const apiKey = process.env["LEMONSQUEEZY_API_KEY"] ?? ""
    const storeId = process.env["LEMONSQUEEZY_STORE_ID"] ?? ""
    if (!apiKey || !storeId) return API_ERRORS.serviceUnavailable("LemonSqueezy")

    lemonSqueezySetup({ apiKey })

    const { data, error } = await createCheckout(storeId, variantId, {
      checkoutData: {
        custom: { user_id: user.id },
      },
      productOptions: {
        redirectUrl: `${APP_CONFIG.url}/notes?upgraded=1`,
      },
    })

    if (error || !data) return API_ERRORS.serviceUnavailable("LemonSqueezy")

    await recordAuditEvent("payment.subscription_started", {
      userId: user.id,
      metadata: { provider: "lemonsqueezy", variantId },
    })

    return Response.json({ checkoutUrl: data.data.attributes.url })
  } catch (err) {
    return handleRouteError(err, "api/payments/lemonsqueezy/checkout")
  }
}
