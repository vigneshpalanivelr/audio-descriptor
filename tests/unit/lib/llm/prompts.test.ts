import { describe, it, expect } from "vitest"
import { buildVerbatimPrompt } from "@/lib/llm/prompts/verbatim"
import { buildLightCleanupPrompt } from "@/lib/llm/prompts/light-cleanup"
import { buildFullRewritePrompt } from "@/lib/llm/prompts/full-rewrite"
import { buildTitlePrompt } from "@/lib/llm/prompts/title"
import { buildWriteLikeMePrompt } from "@/lib/llm/prompts/write-like-me"

const TRANSCRIPT = "um so I was thinking like maybe we should uh do this differently"
const LANG = "en"

describe("buildVerbatimPrompt", () => {
  it("includes the transcript in the output", () => {
    const prompt = buildVerbatimPrompt(TRANSCRIPT, LANG)
    expect(prompt).toContain(TRANSCRIPT)
  })

  it("includes the target language", () => {
    const prompt = buildVerbatimPrompt(TRANSCRIPT, "hi")
    expect(prompt).toContain("hi")
  })

  it("instructs to NOT rephrase (verbatim constraint)", () => {
    const prompt = buildVerbatimPrompt(TRANSCRIPT, LANG)
    expect(prompt).toContain("do NOT rephrase")
  })
})

describe("buildLightCleanupPrompt", () => {
  it("includes the transcript", () => {
    expect(buildLightCleanupPrompt(TRANSCRIPT, LANG)).toContain(TRANSCRIPT)
  })

  it("instructs to preserve speaker voice", () => {
    expect(buildLightCleanupPrompt(TRANSCRIPT, LANG)).toContain("speaker's voice")
  })
})

describe("buildFullRewritePrompt", () => {
  it("includes the transcript", () => {
    expect(buildFullRewritePrompt(TRANSCRIPT, LANG)).toContain(TRANSCRIPT)
  })

  it("includes default register when not specified", () => {
    expect(buildFullRewritePrompt(TRANSCRIPT, LANG)).toContain("neutral")
  })

  it("uses custom register when specified", () => {
    expect(buildFullRewritePrompt(TRANSCRIPT, LANG, "formal")).toContain("formal")
  })
})

describe("buildTitlePrompt", () => {
  it("includes the note content", () => {
    expect(buildTitlePrompt("Some note content", LANG)).toContain("Some note content")
  })

  it("specifies output language", () => {
    expect(buildTitlePrompt("content", "ta")).toContain("ta")
  })

  it("requests 4-8 word title", () => {
    expect(buildTitlePrompt("content", LANG)).toContain("4-8 word")
  })
})

describe("buildWriteLikeMePrompt", () => {
  const samples = ["Sample one", "Sample two", "Sample three"]

  it("includes all writing samples", () => {
    const prompt = buildWriteLikeMePrompt(TRANSCRIPT, LANG, samples)
    for (const sample of samples) {
      expect(prompt).toContain(sample)
    }
  })

  it("includes the transcript", () => {
    expect(buildWriteLikeMePrompt(TRANSCRIPT, LANG, samples)).toContain(TRANSCRIPT)
  })

  it("handles empty samples array without throwing", () => {
    expect(() => buildWriteLikeMePrompt(TRANSCRIPT, LANG, [])).not.toThrow()
  })
})
