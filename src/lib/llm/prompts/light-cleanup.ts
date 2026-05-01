export function buildLightCleanupPrompt(transcript: string, language: string): string {
  return `You are an editor. Lightly clean the following transcript while preserving the speaker's voice and vocabulary.
- Fix grammar and punctuation.
- Remove filler words and false starts.
- Keep the speaker's word choices, idioms, and sentence rhythm.
- Do NOT add new information.
- Output language: ${language}.

Transcript:
${transcript}

Edited:`
}
