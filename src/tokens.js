/**
 * Local token estimate. It never calls an API and never uploads code.
 * The heuristic targets GPT/Claude-style tokenizers: roughly 4 characters per
 * token, with small bumps for punctuation and line breaks, which are tokenized
 * more aggressively in source code. Treat the number as +/- 15%.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const chars = text.length;
  const punctuation = (text.match(/[^\w\s]/g) || []).length;
  const newlines = (text.match(/\n/g) || []).length;
  return Math.max(1, Math.round(chars / 4 + punctuation * 0.06 + newlines * 0.08));
}

export function countLines(text) {
  if (!text) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lines += 1;
  }
  return lines;
}
