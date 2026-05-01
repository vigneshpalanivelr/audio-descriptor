export const INDIAN_LANGUAGES = new Set([
  "hi", // Hindi
  "ta", // Tamil
  "te", // Telugu
  "bn", // Bengali
  "mr", // Marathi
  "kn", // Kannada
  "ml", // Malayalam
  "pa", // Punjabi
  "gu", // Gujarati
  "or", // Odia
  "as", // Assamese
  "ur", // Urdu
  "hinglish",
  "tanglish",
])

export function isIndianLanguage(langCode: string): boolean {
  return INDIAN_LANGUAGES.has(langCode.toLowerCase())
}
