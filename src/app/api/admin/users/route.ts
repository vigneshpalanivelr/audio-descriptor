import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { z } from "zod"
import { adminLogger } from "@/lib/logger/index"

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tier: z.enum(["free", "starter", "pro", "pro_plus_local", "all"]).default("all"),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return API_ERRORS.unauthorized()

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single()

    if (!profile?.is_admin) return API_ERRORS.forbidden()

    const { searchParams } = new URL(request.url)
    const { page, limit, tier } = querySchema.parse(Object.fromEntries(searchParams))
    const offset = (page - 1) * limit

    const service = createServiceClient()

    let query = service
      .from("profiles")
      .select(
        `
        id,
        display_name,
        tier,
        subscription_status,
        subscription_provider,
        last_seen_at,
        login_count,
        is_admin,
        created_at,
        notes(count),
        usage!inner(minutes_used, cost_usd, month)
      `,
        { count: "exact" },
      )
      .order("last_seen_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (tier !== "all") {
      query = query.eq("tier", tier)
    }

    const { data: users, count } = await query

    adminLogger.info({ adminUserId: user.id.slice(0, 8), page, tier }, "admin_users_listed")

    return Response.json({
      users: users ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    })
  } catch (err) {
    return handleRouteError(err, "admin.users")
  }
}
