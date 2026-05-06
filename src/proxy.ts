import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from "@/lib/security/ratelimit"

const PROTECTED_PATHS = ["/notes", "/settings"]
const AUTH_PATHS = ["/auth/sign-in"]
const SUPABASE_TIMEOUT_MS = 1000

function tooManyRequests(resetAt: number): NextResponse {
  return new NextResponse("Too Many Requests", {
    status: 429,
    headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) },
  })
}

function applyRateLimit(key: string, config: RateLimitConfig): NextResponse | null {
  const result = checkRateLimit(key, config)
  return result.allowed ? null : tooManyRequests(result.resetAt)
}

function resolveRateLimit(pathname: string, method: string, ip: string): NextResponse | null {
  if (pathname.startsWith("/api/upload") || pathname.startsWith("/api/transcribe")) {
    return applyRateLimit(`upload:${ip}`, RATE_LIMITS.upload)
  }
  if (pathname.match(/^\/api\/notes\/[^/]+\/regenerate$/) && method === "POST") {
    return applyRateLimit(`regen:${ip}`, RATE_LIMITS.regenerate)
  }
  if (pathname.match(/^\/api\/payments\/[^/]+\/checkout$/) && method === "POST") {
    return applyRateLimit(`checkout:${ip}`, RATE_LIMITS.checkout)
  }
  if (pathname === "/auth/sign-in" && method === "POST") {
    return applyRateLimit(`signin:${ip}`, RATE_LIMITS.signIn)
  }
  return null
}

function buildSupabaseProxyClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      auth: { retryAttempts: 0 },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )
}

async function getUserOrNull(supabase: ReturnType<typeof buildSupabaseProxyClient>) {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), SUPABASE_TIMEOUT_MS),
  )
  try {
    const result = await Promise.race([supabase.auth.getUser().then((r) => r.data.user), timeout])
    return result
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  const { pathname, method } = { pathname: request.nextUrl.pathname, method: request.method }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"

  const rateLimitResponse = resolveRateLimit(pathname, method, ip)
  if (rateLimitResponse) return rateLimitResponse

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p))

  if (!isProtected && !isAuthPath) return response

  const supabase = buildSupabaseProxyClient(request, response)
  const user = await getUserOrNull(supabase)

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/sign-in"
    return NextResponse.redirect(url)
  }

  if (isAuthPath && user) {
    const url = request.nextUrl.clone()
    url.pathname = "/notes"
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
