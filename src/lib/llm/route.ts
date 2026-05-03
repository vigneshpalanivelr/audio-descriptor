import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { isIndianLanguage } from "@/lib/stt/languages"
import { buildVerbatimPrompt } from "./prompts/verbatim"
import { buildLightCleanupPrompt } from "./prompts/light-cleanup"
import { buildFullRewritePrompt } from "./prompts/full-rewrite"
import { buildTitlePrompt } from "./prompts/title"
import type { NoteIntensity, UserTier } from "@/types"

// Override via GEMINI_LLM_MODEL in .env.local
const GEMINI_LLM_MODEL = process.env["GEMINI_LLM_MODEL"] ?? "gemini-2.5-flash"

type LlmProvider = "anthropic" | "openai" | "gemini"

const VALID_PROVIDERS = new Set<string>(["anthropic", "openai", "gemini"])

function resolveProvider(): LlmProvider | undefined {
  /* c8 ignore next */
  const configured = process.env["LLM_PROVIDER"] ?? ""
  if (VALID_PROVIDERS.has(configured)) return configured as LlmProvider
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic"
  if (process.env["OPENAI_API_KEY"]) return "openai"
  if (process.env["GOOGLE_GEMINI_API_KEY"]) return "gemini"
  return undefined
}

function selectProvider(): LlmProvider {
  const provider = resolveProvider()
  if (provider) return provider
  throw new Error(
    "No LLM provider configured. Set LLM_PROVIDER=anthropic|openai|gemini and the matching API key.",
  )
}

function selectAnthropicModel(tier: UserTier, outputLanguage: string): string {
  if (tier === "pro" || tier === "pro_plus_local") {
    if (isIndianLanguage(outputLanguage)) return "claude-haiku-4-5-20251001"
    return "claude-sonnet-4-6"
  }
  return "claude-haiku-4-5-20251001"
}

function selectOpenAIModel(tier: UserTier, outputLanguage: string): string {
  if (tier === "pro" || tier === "pro_plus_local") {
    if (isIndianLanguage(outputLanguage)) return "gpt-4o-mini"
    return "gpt-4o"
  }
  return "gpt-4o-mini"
}

function buildCustomPrompt(
  transcript: string,
  customPrompt: string,
  outputLanguage: string,
): string {
  return `${customPrompt}\n\nTranscript (language: ${outputLanguage}):\n${transcript}`
}

function buildPrompt(
  intensity: NoteIntensity,
  transcript: string,
  outputLanguage: string,
  customPrompt?: string,
): string {
  if (customPrompt) return buildCustomPrompt(transcript, customPrompt, outputLanguage)
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
  customPrompt?: string,
): Promise<CleanupResult> {
  const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
  const model = selectAnthropicModel(tier, outputLanguage)
  const prompt = buildPrompt(intensity, transcript, outputLanguage, customPrompt)

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

async function runCleanupWithOpenAI(
  transcript: string,
  intensity: NoteIntensity,
  outputLanguage: string,
  tier: UserTier,
  customPrompt?: string,
): Promise<CleanupResult> {
  const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] })
  const model = selectOpenAIModel(tier, outputLanguage)
  const prompt = buildPrompt(intensity, transcript, outputLanguage, customPrompt)

  const response = await openai.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const text = response.choices[0]?.message.content ?? ""
  const inputTokens = response.usage?.prompt_tokens ?? 0
  const outputTokens = response.usage?.completion_tokens ?? 0
  // gpt-4o: $2.5/M input, $10/M output; gpt-4o-mini: $0.15/M input, $0.6/M output
  const pricePerMInput = model === "gpt-4o" ? 2.5 : 0.15
  const pricePerMOutput = model === "gpt-4o" ? 10 : 0.6
  const costUsd = (inputTokens * pricePerMInput + outputTokens * pricePerMOutput) / 1_000_000

  return { summary: text.trim(), model, costUsd }
}

async function runCleanupWithGemini(
  transcript: string,
  intensity: NoteIntensity,
  outputLanguage: string,
  customPrompt?: string,
): Promise<CleanupResult> {
  /* c8 ignore next */
  const genAI = new GoogleGenerativeAI(process.env["GOOGLE_GEMINI_API_KEY"] ?? "")
  const model = genAI.getGenerativeModel({ model: GEMINI_LLM_MODEL })
  const prompt = buildPrompt(intensity, transcript, outputLanguage, customPrompt)

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

async function generateTitleWithOpenAI(content: string, language: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] })
  const prompt = buildTitlePrompt(content, language)

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 32,
    messages: [{ role: "user", content: prompt }],
  })

  return response.choices[0]?.message.content?.trim() || "Untitled"
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
  customPrompt?: string,
): Promise<CleanupResult> {
  const provider = selectProvider()
  if (provider === "anthropic")
    return runCleanupWithAnthropic(transcript, intensity, outputLanguage, tier, customPrompt)
  if (provider === "openai")
    return runCleanupWithOpenAI(transcript, intensity, outputLanguage, tier, customPrompt)
  return runCleanupWithGemini(transcript, intensity, outputLanguage, customPrompt)
}

export async function generateTitle(content: string, language: string): Promise<string> {
  const provider = resolveProvider()
  if (!provider) return "Untitled"
  if (provider === "anthropic") return generateTitleWithAnthropic(content, language)
  if (provider === "openai") return generateTitleWithOpenAI(content, language)
  return generateTitleWithGemini(content, language)
}
