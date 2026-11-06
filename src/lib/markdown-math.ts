/** Accept the LaTeX delimiters commonly emitted by assistants, without altering code. */
export function normalizeMarkdownMath(source: string): string {
  let result = "";
  let index = 0;
  let fence: { character: string; length: number } | null = null;
  let inlineTicks = 0;
  while (index < source.length) {
    if (index === 0 || source[index - 1] === "\n") {
      const line = source.slice(index).match(/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/);
      if (line && (!fence || (line[1][0] === fence.character && line[1].length >= fence.length))) {
        fence = fence ? null : { character: line[1][0], length: line[1].length };
        result += line[0]; index += line[0].length; continue;
      }
    }
    if (!fence && source[index] === "`") {
      const ticks = source.slice(index).match(/^`+/)![0];
      if (!inlineTicks) inlineTicks = ticks.length;
      else if (inlineTicks === ticks.length) inlineTicks = 0;
      result += ticks; index += ticks.length; continue;
    }
    if (!fence && !inlineTicks && source[index] === "\\" && (index === 0 || source[index - 1] !== "\\")) {
      const opener = source[index + 1];
      if (opener === "(" || opener === "[") {
        const closing = opener === "(" ? "\\)" : "\\]";
        const end = source.indexOf(closing, index + 2);
        if (end !== -1) {
          const math = source.slice(index + 2, end);
          if (opener === "[" || !math.includes("\n")) {
            result += opener === "[" ? `\n\n$$\n${math.trim()}\n$$\n\n` : `$${math}$`;
            index = end + 2; continue;
          }
        }
      }
    }
    result += source[index++];
  }
  return result;
}
