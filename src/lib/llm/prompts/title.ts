export function buildTitlePrompt(content: string, language: string): string {
  return `Generate a 4-8 word title for this note. No quotes, no punctuation at the end.
Same language as the content: ${language}.

Note:
${content}

Title:`
}
