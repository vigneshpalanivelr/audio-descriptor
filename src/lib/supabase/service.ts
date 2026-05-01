import { createClient } from "@supabase/supabase-js"

// Service-role client — bypasses RLS. Use ONLY in Inngest background jobs.
// Never import this in route handlers or client components.
export function createServiceClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]

  if (!url || !key) {
    throw new Error("Missing Supabase service role environment variables")
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
