export function estimateTextTokens(text) {
  if (text === null || text === undefined) return 0;
  const source = String(text);
  let tokens = 0;
  let inAsciiWord = false;
  let asciiWordLength = 0;

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    const isAsciiWord = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
    if (isAsciiWord) {
      inAsciiWord = true;
      asciiWordLength += 1;
      continue;
    }
    if (inAsciiWord) {
      tokens += Math.max(1, Math.ceil(asciiWordLength / 4));
      inAsciiWord = false;
      asciiWordLength = 0;
    }
    if (code > 32) tokens += 1;
  }

  if (inAsciiWord) tokens += Math.max(1, Math.ceil(asciiWordLength / 4));
  return tokens;
}
