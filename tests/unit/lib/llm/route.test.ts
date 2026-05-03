import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NoteIntensity } from "@/types"

// Mock Anthropic SDK
const anthropicCreateMock = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: anthropicCreateMock },
  })),
}))

// Mock OpenAI SDK
const openaiCreateMock = vi.fn()
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: openaiCreateMock } },
  })),
}))

// Mock Gemini SDK
const geminiCreateMock = vi.fn()
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({ generateContent: geminiCreateMock }),
  })),
}))

function makeAnthropicResponse(text: string, model: string, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: "text", text }],
    model,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

function makeOpenAIResponse(text: string, model: string, inputTokens = 100, outputTokens = 50) {
  return {
    choices: [{ message: { content: text } }],
    model,
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
  }
}

function makeGeminiResponse(text: string) {
  return { response: { text: () => text } }
}

// ─── Provider selection ──────────────────────────────────────────────────────

describe("selectProvider — LLM_PROVIDER config override", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
  })

  it("forces Anthropic when LLM_PROVIDER=anthropic even with all keys set", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic")
    anthropicCreateMock.mockResolvedValue(makeAnthropicResponse("out", "claude-haiku-4-5-20251001"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(anthropicCreateMock).toHaveBeenCalledOnce()
    expect(openaiCreateMock).not.toHaveBeenCalled()
    expect(geminiCreateMock).not.toHaveBeenCalled()
  })

  it("forces OpenAI when LLM_PROVIDER=openai even with all keys set", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai")
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("out", "gpt-4o-mini"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(openaiCreateMock).toHaveBeenCalledOnce()
    expect(anthropicCreateMock).not.toHaveBeenCalled()
    expect(geminiCreateMock).not.toHaveBeenCalled()
  })

  it("forces Gemini when LLM_PROVIDER=gemini even with all keys set", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini")
    geminiCreateMock.mockResolvedValue(makeGeminiResponse("out"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(geminiCreateMock).toHaveBeenCalledOnce()
    expect(anthropicCreateMock).not.toHaveBeenCalled()
    expect(openaiCreateMock).not.toHaveBeenCalled()
  })

  it("ignores invalid LLM_PROVIDER and falls through to priority chain", async () => {
    vi.stubEnv("LLM_PROVIDER", "unknown-provider")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    anthropicCreateMock.mockResolvedValue(makeAnthropicResponse("out", "claude-haiku-4-5-20251001"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(anthropicCreateMock).toHaveBeenCalledOnce()
  })
})

describe("selectProvider — priority fallback (no LLM_PROVIDER)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "")
  })

  it("prefers Anthropic over OpenAI and Gemini", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
    anthropicCreateMock.mockResolvedValue(makeAnthropicResponse("out", "claude-haiku-4-5-20251001"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(anthropicCreateMock).toHaveBeenCalledOnce()
    expect(openaiCreateMock).not.toHaveBeenCalled()
    expect(geminiCreateMock).not.toHaveBeenCalled()
  })

  it("prefers OpenAI over Gemini when Anthropic key absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("out", "gpt-4o-mini"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(openaiCreateMock).toHaveBeenCalledOnce()
    expect(anthropicCreateMock).not.toHaveBeenCalled()
    expect(geminiCreateMock).not.toHaveBeenCalled()
  })

  it("falls back to Gemini when only Gemini key present", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
    geminiCreateMock.mockResolvedValue(makeGeminiResponse("out"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("t", "light", "en", "free")
    expect(geminiCreateMock).toHaveBeenCalledOnce()
  })
})

// ─── Anthropic model selection ───────────────────────────────────────────────

describe("selectAnthropicModel — tier-based routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "anthropic")
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    anthropicCreateMock.mockResolvedValue(
      makeAnthropicResponse("cleaned", "claude-haiku-4-5-20251001"),
    )
  })

  it("uses haiku for free tier", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "light", "en", "free")
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.model).toContain("haiku")
  })

  it("uses haiku for starter tier", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "light", "en", "starter")
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.model).toContain("haiku")
  })

  it("uses sonnet for pro tier with English", async () => {
    anthropicCreateMock.mockResolvedValue(makeAnthropicResponse("cleaned", "claude-sonnet-4-6"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "full", "en", "pro")
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.model).toContain("sonnet")
  })

  it("uses haiku for pro tier with Indian language (cost optimisation)", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "full", "hi", "pro")
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.model).toContain("haiku")
  })

  it("uses sonnet for pro_plus_local with English", async () => {
    anthropicCreateMock.mockResolvedValue(makeAnthropicResponse("cleaned", "claude-sonnet-4-6"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "verbatim", "en", "pro_plus_local")
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.model).toContain("sonnet")
  })
})

// ─── OpenAI model selection ──────────────────────────────────────────────────

describe("selectOpenAIModel — tier-based routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "openai")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("cleaned", "gpt-4o-mini"))
  })

  it("uses gpt-4o-mini for free tier", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "light", "en", "free")
    expect(openaiCreateMock.mock.calls[0]?.[0]?.model).toBe("gpt-4o-mini")
  })

  it("uses gpt-4o-mini for starter tier", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "light", "en", "starter")
    expect(openaiCreateMock.mock.calls[0]?.[0]?.model).toBe("gpt-4o-mini")
  })

  it("uses gpt-4o for pro tier with English", async () => {
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("cleaned", "gpt-4o"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "full", "en", "pro")
    expect(openaiCreateMock.mock.calls[0]?.[0]?.model).toBe("gpt-4o")
  })

  it("uses gpt-4o-mini for pro tier with Indian language (cost optimisation)", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "full", "hi", "pro")
    expect(openaiCreateMock.mock.calls[0]?.[0]?.model).toBe("gpt-4o-mini")
  })

  it("uses gpt-4o for pro_plus_local with English", async () => {
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("cleaned", "gpt-4o"))
    const { runCleanup } = await import("@/lib/llm/route")
    await runCleanup("raw", "verbatim", "en", "pro_plus_local")
    expect(openaiCreateMock.mock.calls[0]?.[0]?.model).toBe("gpt-4o")
  })
})

// ─── Intensity dispatch ──────────────────────────────────────────────────────

describe("runCleanup — intensity dispatch (Anthropic)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "anthropic")
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    anthropicCreateMock.mockResolvedValue(
      makeAnthropicResponse("result text", "claude-haiku-4-5-20251001"),
    )
  })

  const intensities: NoteIntensity[] = ["verbatim", "light", "full"]
  for (const intensity of intensities) {
    it(`dispatches ${intensity} without throwing`, async () => {
      const { runCleanup } = await import("@/lib/llm/route")
      const result = await runCleanup("transcript text", intensity, "en", "free")
      expect(result.summary).toBe("result text")
      expect(result.costUsd).toBeGreaterThanOrEqual(0)
    })
  }

  it("returns empty summary when API returns non-text content", async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "image", source: { type: "url", url: "x" } }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "verbatim", "en", "free")
    expect(result.summary).toBe("")
  })
})

describe("runCleanup — intensity dispatch (OpenAI)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "openai")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("result text", "gpt-4o-mini"))
  })

  const intensities: NoteIntensity[] = ["verbatim", "light", "full"]
  for (const intensity of intensities) {
    it(`dispatches ${intensity} without throwing`, async () => {
      const { runCleanup } = await import("@/lib/llm/route")
      const result = await runCleanup("transcript text", intensity, "en", "free")
      expect(result.summary).toBe("result text")
      expect(result.costUsd).toBeGreaterThanOrEqual(0)
    })
  }

  it("returns empty summary when API returns null content", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: null } }],
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 10, completion_tokens: 0 },
    })
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "verbatim", "en", "free")
    expect(result.summary).toBe("")
  })

  it("handles missing usage gracefully (costUsd = 0)", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "out" } }],
      model: "gpt-4o-mini",
      usage: undefined,
    })
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "light", "en", "free")
    expect(result.costUsd).toBe(0)
  })
})

describe("runCleanup — intensity dispatch (Gemini)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "gemini")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
    geminiCreateMock.mockResolvedValue(makeGeminiResponse("gemini result"))
  })

  const intensities: NoteIntensity[] = ["verbatim", "light", "full"]
  for (const intensity of intensities) {
    it(`dispatches ${intensity} without throwing`, async () => {
      const { runCleanup } = await import("@/lib/llm/route")
      const result = await runCleanup("transcript text", intensity, "en", "free")
      expect(result.summary).toBe("gemini result")
      expect(result.costUsd).toBe(0)
      expect(result.model).toContain("gemini")
    })
  }
})

// ─── Cost calculation ────────────────────────────────────────────────────────

describe("runCleanup — cost calculation (Anthropic)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "anthropic")
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("calculates haiku pricing: $1/M input + $5/M output", async () => {
    anthropicCreateMock.mockResolvedValue(
      makeAnthropicResponse("out", "claude-haiku-4-5-20251001", 1_000_000, 1_000_000),
    )
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "light", "en", "free")
    expect(result.costUsd).toBeCloseTo(6, 1)
  })

  it("calculates sonnet pricing: $3/M input + $15/M output", async () => {
    anthropicCreateMock.mockResolvedValue(
      makeAnthropicResponse("out", "claude-sonnet-4-6", 1_000_000, 1_000_000),
    )
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "full", "en", "pro")
    expect(result.costUsd).toBeCloseTo(18, 1)
  })
})

describe("runCleanup — cost calculation (OpenAI)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "openai")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("calculates gpt-4o-mini pricing: $0.15/M input + $0.6/M output", async () => {
    openaiCreateMock.mockResolvedValue(
      makeOpenAIResponse("out", "gpt-4o-mini", 1_000_000, 1_000_000),
    )
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "light", "en", "free")
    expect(result.costUsd).toBeCloseTo(0.75, 2)
  })

  it("calculates gpt-4o pricing: $2.5/M input + $10/M output", async () => {
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("out", "gpt-4o", 1_000_000, 1_000_000))
    const { runCleanup } = await import("@/lib/llm/route")
    const result = await runCleanup("t", "full", "en", "pro")
    expect(result.costUsd).toBeCloseTo(12.5, 1)
  })
})

// ─── generateTitle ───────────────────────────────────────────────────────────

describe("generateTitle — Anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "anthropic")
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "text", text: "My Generated Title" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 50, output_tokens: 8 },
    })
  })

  it("returns trimmed title string", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("Some note content here", "en")).toBe("My Generated Title")
  })

  it("returns 'Untitled' when API returns no text content", async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "image", source: { type: "url", url: "x" } }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 5, output_tokens: 0 },
    })
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("content", "en")).toBe("Untitled")
  })

  it("always uses haiku model for title generation", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    await generateTitle("content", "en")
    expect(anthropicCreateMock.mock.calls[0]?.[0]?.model).toContain("haiku")
  })
})

describe("generateTitle — OpenAI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "openai")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "sk-oai-test")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
    openaiCreateMock.mockResolvedValue(makeOpenAIResponse("OpenAI Title", "gpt-4o-mini"))
  })

  it("returns trimmed title string", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("Some note content here", "en")).toBe("OpenAI Title")
  })

  it("returns 'Untitled' when API returns null content", async () => {
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: null } }],
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 5, completion_tokens: 0 },
    })
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("content", "en")).toBe("Untitled")
  })

  it("always uses gpt-4o-mini for title generation", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    await generateTitle("content", "en")
    expect(openaiCreateMock.mock.calls[0]?.[0]?.model).toBe("gpt-4o-mini")
  })
})

describe("generateTitle — Gemini", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "gemini")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "gemini-key")
    geminiCreateMock.mockResolvedValue(makeGeminiResponse("Gemini Title"))
  })

  it("returns Gemini-generated title", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("content", "en")).toBe("Gemini Title")
  })

  it("returns 'Untitled' when Gemini returns empty string", async () => {
    geminiCreateMock.mockResolvedValue(makeGeminiResponse(""))
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("content", "en")).toBe("Untitled")
  })
})

// ─── No provider configured ──────────────────────────────────────────────────

describe("runCleanup — no provider configured", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("throws when no provider key is set", async () => {
    const { runCleanup } = await import("@/lib/llm/route")
    await expect(runCleanup("t", "light", "en", "free")).rejects.toThrow(
      "No LLM provider configured",
    )
  })
})

describe("generateTitle — no provider configured", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv("LLM_PROVIDER", "")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "")
  })

  it("returns 'Untitled' when no provider is configured", async () => {
    const { generateTitle } = await import("@/lib/llm/route")
    expect(await generateTitle("content", "en")).toBe("Untitled")
  })
})
