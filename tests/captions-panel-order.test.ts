import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render the real component and real selectors; only the translation context is isolated.
const output = buildSync({
  stdin: { contents: `export {CaptionsPanel} from './src/components/classroom/captions-panel'`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  tsconfig: resolve("tsconfig.json"), external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
  alias: { "@/lib/i18n/context": resolve("tests/fixtures/caption-order-i18n.ts") },
}).outputFiles[0].text;
const loaded = { exports: {} as typeof import("../src/components/classroom/captions-panel") };
new Function("require", "module", "exports", output)(createRequire(import.meta.url), loaded, loaded.exports);
const { CaptionsPanel } = loaded.exports;

function render(canManage: boolean) {
  return renderToStaticMarkup(React.createElement(CaptionsPanel, {
    runtime: { status: "live", interpretation: { enabled: true, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: ["en-US"], status: "running", error: null } } as never,
    captions: [], availability: { shengwang: true, wordly: true }, canManage,
    displayMode: "bilingual", overlayVisible: true, preferredLanguage: "en-US",
    onApplySettings: async () => true, onRetryPreference: () => {},
  }));
}

test("teacher quick switches stay in the caption header outside collapsed settings", () => {
  const html = render(true);
  const summary = html.indexOf('class="classroom-v3-caption-settings-summary"');
  const toggles = html.indexOf('class="classroom-v3-caption-toggles"');
  const display = html.indexOf('class="classroom-v3-caption-view-settings"');
  const disclosure = html.indexOf('class="classroom-v3-caption-settings-disclosure"');
  assert.ok(toggles >= 0 && toggles < summary && summary < disclosure && disclosure < display);
  assert.ok(html.indexOf('class="classroom-v3-caption-title"') < toggles);
  assert.ok(toggles < html.indexOf('class="classroom-v3-caption-heading-actions"'));
  assert.ok(html.indexOf('aria-label="舞台字幕浮窗"') < html.indexOf('aria-label="课堂同传"'));
  assert.ok(html.indexOf('aria-label="课堂同传"') < display);
  assert.match(html, /显示方式/);
  assert.match(html, /我的字幕语言/);
  assert.ok(html.indexOf('课堂主要语言') > display);
  assert.match(html, /原文 \+ 译文/);
  assert.match(html, /应用设置/);
});

test("student caption settings retain their overlay and display controls without teacher interpretation controls", () => {
  const html = render(false);
  assert.match(html, /aria-label="舞台字幕浮窗"/);
  assert.doesNotMatch(html, /aria-label="课堂同传"/);
  assert.doesNotMatch(html, /课堂主要语言/);
  assert.match(html, /我的字幕语言/);
  assert.ok(html.indexOf('class="classroom-v3-caption-toggles"') < html.indexOf('class="classroom-v3-caption-view-settings"'));
});
