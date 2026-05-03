import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { isIndianLanguage } from "@/lib/stt/languages"
import { buildVerbatimPrompt } from "./prompts/verbatim"
import { buildLightCleanupPrompt } from "./prompts/light-cleanup"
import { buildFullRewritePrompt } from "./prompts/full-rewrite"
import { buildTitlePrompt } from "./prompts/title"
import type { NoteIntensity, UserTier } from "@/types"

// Override via GEMINI_LLM_MODEL in .env.local
const GEMINI_LLM_MODEL = process.env["GEMINI_LLM_MODEL"] ?? "gemini-2.5-flash"

function selectAnthropicModel(tier: UserTier, outputLanguage: string): string {
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

async function runCleanupWithAnthropic(
  transcript: string,
  intensity: NoteIntensity,
  outputLanguage: string,
  tier: UserTier,
): Promise<CleanupResult> {
  const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
  const model = selectAnthropicModel(tier, outputLanguage)
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

async function runCleanupWithGemini(
  transcript: string,
  intensity: NoteIntensity,
  outputLanguage: string,
): Promise<CleanupResult> {
  /* c8 ignore next */
  const genAI = new GoogleGenerativeAI(process.env["GOOGLE_GEMINI_API_KEY"] ?? "")
  const model = genAI.getGenerativeModel({ model: GEMINI_LLM_MODEL })
  const prompt = buildPrompt(intensity, transcript, outputLanguage)

  const result = await model.generateContent(prompt)
  return { summary: result.response.text().trim(), model: `gemini:${GEMINI_LLM_MODEL}`, costUsd: 0 }
}

async function generateTitleWithAnthropic(content: string, language: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
  const prompt = buildTitlePrompt(content, language)

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 32,
    messages: [{ role: "user", content: prompt }],
  })

  return response.content[0]?.type === "text" ? response.content[0].text.trim() : "Untitled"
}

async function generateTitleWithGemini(content: string, language: string): Promise<string> {
  /* c8 ignore next */
  const genAI = new GoogleGenerativeAI(process.env["GOOGLE_GEMINI_API_KEY"] ?? "")
  const model = genAI.getGenerativeModel({ model: GEMINI_LLM_MODEL })
  const prompt = buildTitlePrompt(content, language)

  const result = await model.generateContent(prompt)
  return result.response.text().trim() || "Untitled"
}

export async function runCleanup(
  transcript: string,
  intensity: NoteIntensity,
  outputLanguage: string,
  tier: UserTier,
): Promise<CleanupResult> {
  if (process.env["ANTHROPIC_API_KEY"]) {
    return runCleanupWithAnthropic(transcript, intensity, outputLanguage, tier)
  }
  if (process.env["GOOGLE_GEMINI_API_KEY"]) {
    return runCleanupWithGemini(transcript, intensity, outputLanguage)
  }
  throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY.")
}

export async function generateTitle(content: string, language: string): Promise<string> {
  if (process.env["ANTHROPIC_API_KEY"]) {
    return generateTitleWithAnthropic(content, language)
  }
  if (process.env["GOOGLE_GEMINI_API_KEY"]) {
    return generateTitleWithGemini(content, language)
  }
  return "Untitled"
}
