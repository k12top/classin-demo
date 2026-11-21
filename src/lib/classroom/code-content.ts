export type CodeContent = { code: boolean; content: string; language?: string };

const BLOCK_LINE = /^\s*(?:async\s+)?(?:def|class|for|while|if|elif|else|try|except|finally|with|switch|case|function)\b.*(?:[:{])\s*$/;
const ASSIGNMENT_LINE = /^\s*(?:(?:const|let|var)\s+)?[A-Za-z_$][\w$]*(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)*\s*(?:[+\-*/%]?=)\s*\S/;
const CALL_LINE = /^\s*(?:(?:await|return|yield|throw)\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^\n]*\)\s*;?\s*$/;
const DECLARATION_LINE = /^\s*(?:import\s+\S|from\s+\S+\s+import\s+\S|#include\s*[<"]|(?:public|private|protected|static|final|async)\s+\S)/;

function looksLikeCode(value: string): boolean {
  const lines = value.split(/\r?\n/).filter(line => line.trim());
  let score = 0;

  for (const line of lines) {
    if (/^(?:\t| {2,})\S/.test(line)) score += 1;
    if (BLOCK_LINE.test(line)) score += 2;
    if (ASSIGNMENT_LINE.test(line)) score += 2;
    if (CALL_LINE.test(line)) score += 2;
    if (DECLARATION_LINE.test(line)) score += 2;
  }

  return score >= (lines.length > 1 ? 3 : 2);
}

export function classifyCodeContent(value: string, options: { decodeEscapedNewlines?: boolean } = {}): CodeContent {
  const fenced = value.match(/^```([A-Za-z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  if (fenced) {
    return { code: true, content: fenced[2], ...(fenced[1] ? { language: fenced[1] } : {}) };
  }

  if (options.decodeEscapedNewlines && value.includes(String.raw`\n`)) {
    const decoded = value.replaceAll(String.raw`\r\n`, "\n").replaceAll(String.raw`\n`, "\n");
    if (looksLikeCode(decoded)) return { code: true, content: decoded };
  }

  return { code: looksLikeCode(value), content: value };
}
