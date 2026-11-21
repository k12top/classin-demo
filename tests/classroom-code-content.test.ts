import test from "node:test";
import assert from "node:assert/strict";
import { classifyCodeContent } from "../src/lib/classroom/code-content";

test("classifies indented source while preserving submitted whitespace", () => {
  const source = "total = 0\nfor item in values:\n    if item > 20:\n        total += 1\nprint(total)";

  assert.deepEqual(classifyCodeContent(source), { code: true, content: source });
});

test("decodes escaped line breaks only when the resulting option is code", () => {
  const escaped = String.raw`sum = 0\nfor i in range(5):\n    sum += i\nprint(sum)`;

  assert.deepEqual(classifyCodeContent(escaped, { decodeEscapedNewlines: true }), {
    code: true,
    content: "sum = 0\nfor i in range(5):\n    sum += i\nprint(sum)",
  });

  const literalEscape = String.raw`print("\n")`;
  assert.deepEqual(classifyCodeContent(literalEscape, { decodeEscapedNewlines: true }), {
    code: true,
    content: literalEscape,
  });
});

test("keeps ordinary prose and Markdown out of the code renderer", () => {
  for (const content of [
    "第一步：先读题。\n第二步：再计算。",
    "Use the value if it is available.",
    "结果是 **10**，因为 $0+1+2+3+4=10$。",
  ]) {
    assert.deepEqual(classifyCodeContent(content), { code: false, content });
  }
});

test("unwraps explicit fenced code and retains its language", () => {
  assert.deepEqual(classifyCodeContent("```python\nif ready:\n    run()\n```"), {
    code: true,
    content: "if ready:\n    run()",
    language: "python",
  });
});
