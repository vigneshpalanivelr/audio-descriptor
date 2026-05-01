export function buildFullRewritePrompt(
  transcript: string,
  language: string,
  register: string = "neutral",
): string {
  return `You are a writing assistant. Rewrite the transcript as a clear, well-structured piece of writing.
- Preserve all ideas and the speaker's intent.
- Improve flow, clarity, and structure.
- Use paragraphs, lists, or headings where they help.
- Match the register: ${register}.
- Output language: ${language}.

Transcript:
${transcript}

Rewritten:`
}
