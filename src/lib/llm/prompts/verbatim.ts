export function buildVerbatimPrompt(transcript: string, language: string): string {
  return `You are a transcript cleaner. Apply ONLY these changes:
- Add punctuation, capitalization, and paragraph breaks.
- Remove filler words: "um", "uh", "like", "you know" (and their equivalents in ${language}).
- Do NOT change vocabulary, do NOT rephrase, do NOT add or remove ideas.
- Output in the same language as the transcript: ${language}.

Transcript:
${transcript}

Cleaned transcript:`
}
