import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { API_ERRORS, handleRouteError } from "@/lib/api/error"
import { adminLogger } from "@/lib/logger/index"

export async function GET(): Promise<Response> {
  try {
    // Auth + admin check — defence-in-depth (middleware + here)
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

    if (!profile?.is_admin) {
      adminLogger.warn({ userId: user.id.slice(0, 8) }, "admin_access_denied")
      return API_ERRORS.forbidden()
    }

    const service = createServiceClient()

    // Fetch all stats in parallel
    const [
      { count: totalUsers },
      { count: totalNotes },
      { data: liveUsers },
      { data: tierBreakdown },
      { data: recentActivity },
      { data: tokenUsage },
      { data: recentSessions },
    ] = await Promise.all([
      service.from("profiles").select("*", { count: "exact", head: true }),
      service.from("notes").select("*", { count: "exact", head: true }),
      service.rpc("get_live_users"),
      service
        .from("profiles")
        .select("tier")
        .then(({ data }) => ({
          data: data
            ? Array.from(
                data
                  .reduce((acc, p) => {
                    acc.set(p.tier, (acc.get(p.tier) ?? 0) + 1)
                    return acc
                  }, new Map<string, number>())
                  .entries(),
              ).map(([tier, count]) => ({ tier, count }))
            : [],
        })),
      service
        .from("audit_logs")
        .select("event_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(50),
      service.rpc("get_user_token_usage"),
      service
        .from("user_sessions")
        .select(
          `
          id,
          user_id,
          logged_in_at,
          logged_out_at,
          is_active,
          ip_address,
          profiles!inner(display_name, tier, subscription_status)
        `,
        )
        .order("logged_in_at", { ascending: false })
        .limit(100),
    ])

    adminLogger.info({ adminUserId: user.id.slice(0, 8) }, "admin_stats_fetched")

    return Response.json({
      overview: {
        totalUsers: totalUsers ?? 0,
        totalNotes: totalNotes ?? 0,
        liveUsersCount: liveUsers?.length ?? 0,
      },
      liveUsers: liveUsers ?? [],
      tierBreakdown: tierBreakdown ?? [],
      recentActivity: recentActivity ?? [],
      tokenUsage: tokenUsage ?? [],
      recentSessions: recentSessions ?? [],
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return handleRouteError(err, "admin.stats")
  }
}
