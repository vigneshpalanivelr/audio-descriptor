import { ZodError } from "zod"
import { appLogger } from "@/lib/logger/index"

// ─── Standard API error shape ─────────────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  const body: ApiError = { code, message, ...(details ? { details } : {}) }
  return Response.json(body, { status })
}

// ─── Typed error codes ────────────────────────────────────────────────────────

export const API_ERRORS = {
  unauthorized: () => errorResponse("UNAUTHORIZED", "Authentication required", 401),
  forbidden: () => errorResponse("FORBIDDEN", "Insufficient permissions", 403),
  notFound: (resource = "Resource") => errorResponse("NOT_FOUND", `${resource} not found`, 404),
  rateLimited: (retryAfterSeconds: number) =>
    errorResponse("RATE_LIMITED", "Too many requests", 429, {
      retryAfter: retryAfterSeconds,
    }),
  usageLimitReached: (tier: string) =>
    errorResponse("USAGE_LIMIT_REACHED", "Monthly usage limit reached", 402, { tier }),
  invalidInput: (errors: Record<string, string[]>) =>
    errorResponse("INVALID_INPUT", "Request validation failed", 422, { errors }),
  fileTooLarge: (maxMb: number) =>
    errorResponse("FILE_TOO_LARGE", `File exceeds ${maxMb}MB limit`, 413),
  unsupportedMediaType: () =>
    errorResponse("UNSUPPORTED_MEDIA_TYPE", "Audio format not supported", 415),
  internalError: () => errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500),
  serviceUnavailable: (service: string) =>
    errorResponse("SERVICE_UNAVAILABLE", `${service} is temporarily unavailable`, 503),
} as const

// ─── Zod error normaliser ─────────────────────────────────────────────────────

export function formatZodErrors(error: ZodError): Record<string, string[]> {
  const result = new Map<string, string[]>()
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "root"
    const existing = result.get(key) ?? []
    existing.push(issue.message)
    result.set(key, existing)
  }
  return Object.fromEntries(result)
}

// ─── Catch-all handler for route handlers ────────────────────────────────────

export function handleRouteError(err: unknown, context: string): Response {
  if (err instanceof ZodError) {
    return API_ERRORS.invalidInput(formatZodErrors(err))
  }

  appLogger.error({ err, context }, "unhandled_route_error")
  return API_ERRORS.internalError()
}
