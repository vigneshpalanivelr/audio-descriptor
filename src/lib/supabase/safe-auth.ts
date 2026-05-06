import type { SupabaseClient } from "@supabase/supabase-js"

const AUTH_TIMEOUT_MS = 2000

export async function safeGetUser(
  supabase: SupabaseClient,
  timeoutMs = AUTH_TIMEOUT_MS,
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["getUser"]>>["data"]["user"]> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  try {
    return await Promise.race([supabase.auth.getUser().then((r) => r.data.user), timeout])
  } catch {
    return null
  }
}
