import Anthropic from "@anthropic-ai/sdk"
import { isIndianLanguage } from "@/lib/stt/languages"
import { buildVerbatimPrompt } from "./prompts/verbatim"
import { buildLightCleanupPrompt } from "./prompts/light-cleanup"
import { buildFullRewritePrompt } from "./prompts/full-rewrite"
import { buildTitlePrompt } from "./prompts/title"
import type { NoteIntensity, UserTier } from "@/types"

const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })

function selectModel(tier: UserTier, outputLanguage: string): string {
  if (tier === "pro" || tier === "pro_plus_local") {
    if (isIndianLanguage(outputLanguage)) return "claude-haiku-4-5-20251001"
    return "claude-sonnet-4-6"
  }
  return "claude-haiku-4-5-20251001"
}

function buildPrompt(intensity: NoteIntensity, transcript: string, outputLanguage: string): string {
  switch (intensity) {
    case "verbatim":
      return buildVerbatimPrompt(transcript, outputLanguage)
    case "light":
      return buildLightCleanupPrompt(transcript, outputLanguage)
    case "full":
      return buildFullRewritePrompt(transcript, outputLanguage)
  }
}

export interface CleanupResult {
  summary: string
  model: string
  costUsd: number
}

export async function runCleanup(
  transcript: string,
  intensity: NoteIntensity,
  outputLanguage: string,
  tier: UserTier,
): Promise<CleanupResult> {
  const model = selectModel(tier, outputLanguage)
  const prompt = buildPrompt(intensity, transcript, outputLanguage)

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const text = response.content[0]?.type === "text" ? response.content[0].text : ""

  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const pricePerMInput = model.includes("sonnet") ? 3 : 1
  const pricePerMOutput = model.includes("sonnet") ? 15 : 5
  const costUsd = (inputTokens * pricePerMInput + outputTokens * pricePerMOutput) / 1_000_000

  return { summary: text.trim(), model, costUsd }
}

export async function generateTitle(content: string, language: string): Promise<string> {
  const prompt = buildTitlePrompt(content, language)

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 32,
    messages: [{ role: "user", content: prompt }],
  })

  return response.content[0]?.type === "text" ? response.content[0].text.trim() : "Untitled"
}
