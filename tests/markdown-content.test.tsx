import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "../src/components/markdown-content";
import { normalizeMarkdownMath } from "../src/lib/markdown-math";

test("renders Markdown and inline and display math in common delimiters", () => {
  const content = String.raw`**步骤**：$x^2$ 和 \(\frac{1}{2}\)

\[a^2+b^2=c^2\]

$$
\sqrt{4}=2
$$

- 第一步
- 第二步`;
  const html = renderToStaticMarkup(<MarkdownContent content={content} />);
  assert.match(html, /<strong>步骤<\/strong>/);
  assert.equal((html.match(/class="katex"/g) || []).length, 4);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<li>第一步<\/li>/);
  assert.match(html, /<math/);
});

test("leaves code untouched and does not execute raw HTML or unsafe links", () => {
  const input = [String.raw`代码 \(x\)，\(x+1\)`, "", "`" + String.raw`\(not math\)` + "`", "", "```tex", String.raw`\[not math\]`, "```", "", "<script>alert(1)</script> [bad](javascript:alert(1))"].join("\n");
  const normalized = normalizeMarkdownMath(input);
  assert.match(normalized, /\$x\$/);
  assert.ok(normalized.includes(String.raw`\(not math\)`));
  assert.ok(normalized.includes(String.raw`\[not math\]`));
  const html = renderToStaticMarkup(<MarkdownContent content={input} />);
  assert.doesNotMatch(html, /<script|href="javascript:/i);
  assert.match(html, /<code>.*not math/);
  assert.equal((html.match(/class="katex"/g) || []).length, 2);
});
