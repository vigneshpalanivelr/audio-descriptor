import { describe, it, expect, vi } from "vitest"
import { ZodError, z } from "zod"
import { errorResponse, API_ERRORS, formatZodErrors, handleRouteError } from "@/lib/api/error"

vi.mock("@/lib/logger/index", () => ({
  appLogger: { error: vi.fn(), warn: vi.fn() },
}))

describe("errorResponse", () => {
  it("returns Response with correct status code", async () => {
    const res = errorResponse("TEST", "test message", 418)
    expect(res.status).toBe(418)
  })

  it("serialises code and message in JSON body", async () => {
    const res = errorResponse("MY_CODE", "my message", 400)
    const body = await res.json()
    expect(body.code).toBe("MY_CODE")
    expect(body.message).toBe("my message")
  })

  it("omits details key when not provided", async () => {
    const res = errorResponse("X", "x", 400)
    const body = await res.json()
    expect(body).not.toHaveProperty("details")
  })

  it("includes details when provided", async () => {
    const res = errorResponse("X", "x", 400, { foo: "bar" })
    const body = await res.json()
    expect(body.details?.foo).toBe("bar")
  })
})

describe("API_ERRORS", () => {
  it("unauthorized returns 401", () => {
    expect(API_ERRORS.unauthorized().status).toBe(401)
  })

  it("forbidden returns 403", () => {
    expect(API_ERRORS.forbidden().status).toBe(403)
  })

  it("notFound returns 404", () => {
    expect(API_ERRORS.notFound().status).toBe(404)
  })

  it("rateLimited returns 429 with retryAfter in body", async () => {
    const res = API_ERRORS.rateLimited(60)
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.details?.retryAfter).toBe(60)
  })

  it("usageLimitReached returns 402 with tier in body", async () => {
    const res = API_ERRORS.usageLimitReached("free")
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.details?.tier).toBe("free")
  })

  it("invalidInput returns 422 with errors in body", async () => {
    const res = API_ERRORS.invalidInput({ field: ["required"] })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.details?.errors?.field).toContain("required")
  })

  it("fileTooLarge returns 413 with max in message", async () => {
    const res = API_ERRORS.fileTooLarge(25)
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.message).toContain("25MB")
  })

  it("unsupportedMediaType returns 415", () => {
    expect(API_ERRORS.unsupportedMediaType().status).toBe(415)
  })

  it("internalError returns 500", () => {
    expect(API_ERRORS.internalError().status).toBe(500)
  })

  it("serviceUnavailable returns 503 with service name in message", async () => {
    const res = API_ERRORS.serviceUnavailable("OpenAI")
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.message).toContain("OpenAI")
  })
})

describe("formatZodErrors", () => {
  it("maps field path to array of messages", () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() })
    const result = schema.safeParse({ name: "", age: "not-a-number" })
    const errors = formatZodErrors((result as { error: ZodError }).error)
    expect(errors["name"]).toBeDefined()
  })

  it("uses 'root' for top-level errors", () => {
    const schema = z.string().min(5)
    const result = schema.safeParse("hi")
    const errors = formatZodErrors((result as { error: ZodError }).error)
    expect(errors["root"]).toBeDefined()
  })

  it("collects multiple messages for the same field", () => {
    const schema = z.object({ pw: z.string().min(8).max(4) })
    const result = schema.safeParse({ pw: "abc" })
    const errors = formatZodErrors((result as { error: ZodError }).error)
    expect(errors["pw"]!.length).toBeGreaterThanOrEqual(1)
  })
})

describe("handleRouteError", () => {
  it("returns 422 for ZodError", () => {
    const schema = z.object({ x: z.number() })
    const result = schema.safeParse({ x: "bad" })
    const res = handleRouteError((result as { error: ZodError }).error, "test")
    expect(res.status).toBe(422)
  })

  it("returns 500 for unknown error", () => {
    const res = handleRouteError(new Error("boom"), "test")
    expect(res.status).toBe(500)
  })

  it("returns 500 for non-Error thrown values", () => {
    const res = handleRouteError("string error", "test")
    expect(res.status).toBe(500)
  })
})
