import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NoteIntensity } from "@/types"

// Mock Anthropic SDK — avoids real API calls
const createMock = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}))

function makeAnthropicResponse(text: string, model: string) {
  return {
    content: [{ type: "text", text }],
    model,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

describe("selectModel — tier-based routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    createMock.mockResolvedValue(makeAnthropicResponse("cleaned", "claude-haiku-4-5-20251001"))
  })

  it("uses haiku for free tier", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("raw", "light", "en", "free")
    const callArgs = createMock.mock.calls[0]?.[0]
    expect(callArgs?.model).toContain("haiku")
    expect(result.model).toContain("haiku")
  })

  it("uses haiku for starter tier", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "light", "en", "starter")
    const callArgs = createMock.mock.calls[0]?.[0]
    expect(callArgs?.model).toContain("haiku")
  })

  it("uses sonnet for pro tier with English", async () => {
    createMock.mockResolvedValue(makeAnthropicResponse("cleaned", "claude-sonnet-4-6"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "full", "en", "pro")
    const callArgs = createMock.mock.calls[0]?.[0]
    expect(callArgs?.model).toContain("sonnet")
  })

  it("uses haiku for pro tier with Indian language (cost optimisation)", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "full", "hi", "pro")
    const callArgs = createMock.mock.calls[0]?.[0]
    expect(callArgs?.model).toContain("haiku")
  })

  it("uses sonnet for pro_plus_local with English", async () => {
    createMock.mockResolvedValue(makeAnthropicResponse("cleaned", "claude-sonnet-4-6"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "verbatim", "en", "pro_plus_local")
    const callArgs = createMock.mock.calls[0]?.[0]
    expect(callArgs?.model).toContain("sonnet")
  })
})

describe("runCleanup — intensity → prompt dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    createMock.mockResolvedValue(makeAnthropicResponse("result text", "claude-haiku-4-5-20251001"))
  })

  const intensities: NoteIntensity[] = ["verbatim", "light", "full"]
  for (const intensity of intensities) {
    it(`dispatches ${intensity} intensity without throwing`, async () => {
      const { runCleanup } = await import("@/lib/llm/route")
      const result = await runCleanup("transcript text", intensity, "en", "free")
      expect(result.summary).toBe("result text")
      expect(result.costUsd).toBeGreaterThanOrEqual(0)
    })
  }

  it("returns empty summary when API returns non-text content", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "image", source: { type: "url", url: "x" } }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "verbatim", "en", "free")
    expect(result.summary).toBe("")
  })
})

describe("runCleanup — cost calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("calculates cost using haiku pricing for haiku model", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "out" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    })
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "light", "en", "free")
    // haiku: $1/M input + $5/M output = $6 for 1M each
    expect(result.costUsd).toBeCloseTo(6, 1)
  })

  it("calculates cost using sonnet pricing for sonnet model", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "out" }],
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    })
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "full", "en", "pro")
    // sonnet: $3/M input + $15/M output = $18 for 1M each
    expect(result.costUsd).toBeCloseTo(18, 1)
  })
})

describe("generateTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "My Generated Title" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 50, output_tokens: 8 },
    })
  })

  it("returns trimmed title string", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    const title = await generateTitle("Some note content here", "en")
    expect(title).toBe("My Generated Title")
  })

  it("returns 'Untitled' when API returns no text content", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "image", source: { type: "url", url: "x" } }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 5, output_tokens: 0 },
    })
    const { generateTitle } = await import("@/lib/llm/route")
    const title = await generateTitle("content", "en")
    expect(title).toBe("Untitled")
  })

  it("always uses haiku model for title generation", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    await generateTitle("content", "en")
    expect(createMock.mock.calls[0]?.[0]?.model).toContain("haiku")
  })
})
