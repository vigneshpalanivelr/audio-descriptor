// Phase 2 feature — stubbed for Phase 1
export function buildWriteLikeMePrompt(
  transcript: string,
  language: string,
  writingSamples: string[],
): string {
  const samples = writingSamples.map((s, i) => `Sample ${i + 1}:\n${s}`).join("\n\n")

  return `You are imitating a specific writer's voice. Here are samples of their writing:

<samples>
${samples}
</samples>

Now rewrite the following transcript in that exact voice — same vocabulary patterns, sentence length, idioms, formality level. Output language: ${language}.

Transcript:
${transcript}

Rewritten in the user's voice:`
}
