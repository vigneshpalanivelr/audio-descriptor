import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { APP_CONFIG } from "@/config/app"

// IST offset helper — used for display only
function toIST(utcString: string | null): string {
  if (!utcString) return "—"
  return new Date(utcString).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function auditEventClass(eventType: string): string {
  if (eventType.startsWith("security.")) return "bg-red-100 text-red-700"
  if (eventType.startsWith("payment.")) return "bg-green-100 text-green-700"
  if (eventType.startsWith("auth.")) return "bg-blue-100 text-blue-700"
  return "bg-gray-100 text-gray-700"
}

interface AdminStats {
  overview: { totalUsers: number; totalNotes: number; liveUsersCount: number }
  liveUsers: Array<{ user_id: string; last_seen_ist: string }>
  tierBreakdown: Array<{ tier: string; count: number }>
  recentActivity: Array<{
    event_type: string
    created_at: string
    metadata: Record<string, unknown> | null
  }>
  tokenUsage: Array<{ user_id: string; notes_count: number; total_cost_usd: number }>
  recentSessions: Array<{
    id: string
    user_id: string
    logged_in_at: string
    logged_out_at: string | null
    is_active: boolean
    ip_address: string | null
    profiles: { display_name: string | null; tier: string; subscription_status: string }
  }>
}

async function fetchAdminStats(): Promise<AdminStats | null> {
  try {
    const base = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(`${base}/api/admin/stats`, {
      headers: { Cookie: `sb-access-token=${session.access_token}` },
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as AdminStats
  } catch {
    return null
  }
}

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) redirect("/notes")

  const stats = await fetchAdminStats()

  const TIER_COLORS = new Map([
    ["free", "bg-gray-100 text-gray-700"],
    ["starter", "bg-blue-100 text-blue-700"],
    ["pro", "bg-purple-100 text-purple-700"],
    ["pro_plus_local", "bg-orange-100 text-orange-700"],
  ])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{APP_CONFIG.name} — Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          All times shown in IST (Asia/Kolkata). Auto-refreshes every 30s.
        </p>
      </header>

      {!stats && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load stats. Check server logs.
        </div>
      )}

      {stats && (
        <div className="space-y-8">
          {/* ── Overview ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Overview</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Users", value: stats.overview.totalUsers },
                { label: "Total Notes", value: stats.overview.totalNotes },
                { label: "Live Now (≤5 min)", value: stats.overview.liveUsersCount },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="mt-1 text-3xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Tier Breakdown ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Users by Tier</h2>
            <div className="flex flex-wrap gap-3">
              {stats.tierBreakdown.map(({ tier, count }) => (
                <div
                  key={tier}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${TIER_COLORS.get(tier) ?? "bg-gray-100 text-gray-700"}`}
                >
                  {tier}: {count}
                </div>
              ))}
            </div>
          </section>

          {/* ── Live Users ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Live Users ({stats.liveUsers.length})</h2>
            {stats.liveUsers.length === 0 ? (
              <p className="text-sm text-gray-400">No active users in the last 5 minutes.</p>
            ) : (
              <table className="w-full rounded-lg border bg-white text-sm shadow-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2">User ID (masked)</th>
                    <th className="px-4 py-2">Last Seen (IST)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.liveUsers.map((u) => (
                    <tr key={u.user_id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{u.user_id.slice(0, 8)}…</td>
                      <td className="px-4 py-2">{u.last_seen_ist}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── Recent Sessions ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Recent Sessions</h2>
            <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Tier</th>
                    <th className="px-4 py-2">Login (IST)</th>
                    <th className="px-4 py-2">Logout (IST)</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSessions.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-4 py-2">
                        {s.profiles.display_name ?? `user-${s.user_id.slice(0, 6)}`}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${TIER_COLORS.get(s.profiles.tier) ?? ""}`}
                        >
                          {s.profiles.tier}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{toIST(s.logged_in_at)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{toIST(s.logged_out_at)}</td>
                      <td className="px-4 py-2">
                        {s.is_active ? (
                          <span className="text-green-600">● Active</span>
                        ) : (
                          <span className="text-gray-400">Ended</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{s.ip_address ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── LLM Token / Cost Usage ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">LLM Cost by User (last 30 days)</h2>
            <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2">User ID (masked)</th>
                    <th className="px-4 py-2">Notes</th>
                    <th className="px-4 py-2">Total Cost (USD)</th>
                    <th className="px-4 py-2">Avg / Note</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.tokenUsage.map((u) => (
                    <tr key={u.user_id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{u.user_id.slice(0, 8)}…</td>
                      <td className="px-4 py-2">{u.notes_count}</td>
                      <td className="px-4 py-2">${Number(u.total_cost_usd).toFixed(4)}</td>
                      <td className="px-4 py-2">
                        $
                        {(Number(u.total_cost_usd) / Math.max(1, Number(u.notes_count))).toFixed(4)}
                      </td>
                    </tr>
                  ))}
                  {stats.tokenUsage.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                        No usage data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Recent Audit Events ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Recent Audit Events</h2>
            <div className="rounded-lg border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Event</th>
                    <th className="px-4 py-2">Time (IST)</th>
                    <th className="px-4 py-2">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentActivity.map((a, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${auditEventClass(a.event_type)}`}
                        >
                          {a.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{toIST(a.created_at)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">
                        {a.metadata ? JSON.stringify(a.metadata) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
