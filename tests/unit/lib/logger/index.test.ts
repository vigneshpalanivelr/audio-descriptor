import { describe, it, expect, vi, beforeEach } from "vitest"

// Capture pino constructor args before importing the module under test
const pinoInstance = {
  child: vi.fn().mockReturnThis(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
const multistreamMock = vi.fn(() => ({}))
const transportMock = vi.fn(() => ({}))
const pinoMock = Object.assign(
  vi.fn(() => pinoInstance),
  {
    multistream: multistreamMock,
    transport: transportMock,
    stdTimeFunctions: { isoTime: vi.fn() },
  },
)
vi.mock("pino", () => ({ default: pinoMock }))
vi.mock("pino-rotating-file-stream", () => ({ default: vi.fn(() => ({})) }))

describe("logger — production transport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    pinoMock.mockClear()
    multistreamMock.mockClear()
    transportMock.mockClear()
  })

  it("calls pino.multistream when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    await import("@/lib/logger/index")
    expect(multistreamMock).toHaveBeenCalledOnce()
    vi.unstubAllEnvs()
  })

  it("does not call pino.multistream when NODE_ENV is development", async () => {
    vi.stubEnv("NODE_ENV", "development")
    await import("@/lib/logger/index")
    expect(multistreamMock).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it("calls pino.transport with pino-pretty when NODE_ENV is development", async () => {
    vi.stubEnv("NODE_ENV", "development")
    await import("@/lib/logger/index")
    expect(transportMock).toHaveBeenCalledOnce()
    expect(transportMock).toHaveBeenCalledWith(expect.objectContaining({ target: "pino-pretty" }))
    vi.unstubAllEnvs()
  })
})

describe("logger — PII redaction config", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    pinoMock.mockClear()
    multistreamMock.mockClear()
    transportMock.mockClear()
  })

  async function getRedactedPaths(): Promise<string[]> {
    await import("@/lib/logger/index")
    const calls = pinoMock.mock.calls as unknown as Array<[{ redact?: { paths: string[] } }]>
    return calls[0]?.[0]?.redact?.paths ?? []
  }

  it("configures redact paths that include email", async () => {
    expect(await getRedactedPaths()).toContain("email")
  })

  it("configures redact paths that include transcript", async () => {
    expect(await getRedactedPaths()).toContain("transcript")
  })

  it("configures redact paths that include token and api_key", async () => {
    const paths = await getRedactedPaths()
    expect(paths).toContain("token")
    expect(paths).toContain("api_key")
  })

  it("configures redact paths that include password and secret", async () => {
    const paths = await getRedactedPaths()
    expect(paths).toContain("password")
    expect(paths).toContain("secret")
  })

  it("uses [REDACTED] as the censor value", async () => {
    await import("@/lib/logger/index")
    const calls = pinoMock.mock.calls as unknown as Array<[{ redact?: { censor: string } }]>
    expect(calls[0]?.[0]?.redact?.censor).toBe("[REDACTED]")
  })

  it("exports named child loggers for each module", async () => {
    const mod = await import("@/lib/logger/index")
    expect(mod.appLogger).toBeDefined()
    expect(mod.authLogger).toBeDefined()
    expect(mod.sttLogger).toBeDefined()
    expect(mod.llmLogger).toBeDefined()
    expect(mod.paymentLogger).toBeDefined()
    expect(mod.adminLogger).toBeDefined()
    expect(mod.auditLogger).toBeDefined()
  })

  it("includes display_name and summary in redacted paths", async () => {
    const paths = await getRedactedPaths()
    expect(paths).toContain("display_name")
    expect(paths).toContain("summary")
  })

  it("includes audio_storage_path in redacted paths", async () => {
    expect(await getRedactedPaths()).toContain("audio_storage_path")
  })
})
