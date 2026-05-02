import { createClient } from "@/lib/supabase/server"
import { isSafeRedirectPath } from "@/lib/security/sanitize"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const nextParam = searchParams.get("next") ?? "/notes"
  // Reject open-redirect attempts — only allow relative paths within this app
  const next = isSafeRedirectPath(nextParam) ? nextParam : "/notes"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/sign-in?error=auth_callback_failed`)
}
