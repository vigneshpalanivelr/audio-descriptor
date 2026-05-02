import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
  const origin = request.headers.get("origin")
  // CSRF guard — reject cross-origin sign-out requests
  if (origin && origin !== appUrl) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL("/auth/sign-in", appUrl))
}
