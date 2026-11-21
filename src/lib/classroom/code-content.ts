export type CodeContent = { code: boolean; content: string; language?: string };

const BLOCK_LINE = /^\s*(?:async\s+)?(?:def|class|for|while|if|elif|else|try|except|finally|with|switch|case|function)\b.*(?:[:{])\s*$/;
const ASSIGNMENT_LINE = /^\s*(?:(?:const|let|var)\s+)?[A-Za-z_$][\w$]*(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)*\s*(?:[+\-*/%]?=)\s*\S/;
const CALL_LINE = /^\s*(?:(?:await|return|yield|throw)\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\([^\n]*\)\s*;?\s*$/;
const DECLARATION_LINE = /^\s*(?:import\s+\S|from\s+\S+\s+import\s+\S|#include\s*[<"])/;

function looksLikeCode(value: string): boolean {
  const lines = value.split(/\r?\n/).filter(line => line.trim());
  let score = 0;
  let indented = false;

  for (const line of lines) {
    if (/^(?:\t| {2,})\S/.test(line)) indented = true;
    if (BLOCK_LINE.test(line)) score += 2;
    if (ASSIGNMENT_LINE.test(line)) score += 2;
    if (CALL_LINE.test(line)) score += 2;
    if (DECLARATION_LINE.test(line)) score += 2;
  }

  if (indented) score += 1;
  return score >= (lines.length > 1 ? 3 : 2);
}

function decodeLineSeparators(value: string): string {
  let result = "", quote = "", escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      result += char;
      continue;
    }
    if (char === "\\" && value[index + 1] === "r" && value[index + 2] === "\\" && value[index + 3] === "n") {
      result += "\n";
      index += 3;
      continue;
    }
    if (char === "\\" && value[index + 1] === "n") {
      result += "\n";
      index += 1;
      continue;
    }
    result += char;
  }
  return result;
}

export function classifyCodeContent(value: string, options: { decodeEscapedNewlines?: boolean } = {}): CodeContent {
  const fenced = value.match(/^```([A-Za-z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  if (fenced && !fenced[2].includes("```")) {
    return { code: true, content: fenced[2], ...(fenced[1] ? { language: fenced[1] } : {}) };
  }
  if (value.includes("```")) return { code: false, content: value };

  if (options.decodeEscapedNewlines && value.includes(String.raw`\n`)) {
    const decoded = decodeLineSeparators(value);
    if (looksLikeCode(decoded)) return { code: true, content: decoded };
  }

  return { code: looksLikeCode(value), content: value };
}
