import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const output = buildSync({
  stdin: { contents: `export {ActivityTextContent} from './src/components/classroom/activity-text-content';`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, outfile: "activity-text-content.cjs", platform: "node", format: "cjs", jsx: "automatic", tsconfig: resolve("tsconfig.json"),
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"], loader: { ".css": "empty" },
}).outputFiles[0].text;
const loaded = { exports: {} as typeof import("../src/components/classroom/activity-text-content") };
new Function("require", "module", "exports", output)(createRequire(import.meta.url), loaded, loaded.exports);
const { ActivityTextContent } = loaded.exports;

function render(content: string, decodeEscapedNewlines = false) {
  return renderToStaticMarkup(React.createElement(ActivityTextContent, { content, decodeEscapedNewlines }));
}

test("renders submitted source as one semantic code block with indentation intact", () => {
  const html = render("for item in values:\n    if item:\n        print(item)");

  assert.match(html, /^<pre[^>]*><code>for item in values:\n    if item:\n        print\(item\)<\/code><\/pre>$/);
});

test("repairs escaped AI option lines without changing a literal newline escape", () => {
  const option = render(String.raw`sum = 0\nfor i in range(5):\n    sum += i`, true);
  assert.match(option, /<code>sum = 0\nfor i in range\(5\):\n    sum \+= i<\/code>/);

  const literal = render(String.raw`print("\n")`, true);
  assert.match(literal, /<code>print\(&quot;\\n&quot;\)<\/code>/);
  assert.doesNotMatch(literal, /print\(&quot;\n/);
});

test("keeps prose in Markdown and unwraps fenced code exactly once", () => {
  assert.match(render("这是 **普通说明**。"), /<div[^>]*><p>这是 <strong>普通说明<\/strong>。<\/p><\/div>/);

  const fenced = render("```python\nif ready:\n    run()\n```");
  assert.equal((fenced.match(/<pre/g) || []).length, 1);
  assert.doesNotMatch(fenced, /```/);
  assert.match(fenced, /data-language="python"/);
});
