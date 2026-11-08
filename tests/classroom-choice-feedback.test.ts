import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityDetail, ActivityQuestion, ActivityResponse } from "../src/lib/classroom/activities";

const output = buildSync({
  stdin: { contents: `export {ActivityChoiceOptions} from './src/components/classroom/activity-choice-options';export {ActivityResults} from './src/components/classroom/activity-results';export {ActivitySolutions,ActivityChatCard} from './src/components/classroom/activity-chat-card';export {I18nProvider} from './src/lib/i18n/context';`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, outfile: "choice-feedback.cjs", platform: "node", format: "cjs", jsx: "automatic", tsconfig: resolve("tsconfig.json"),
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"], loader: { ".css": "empty" },
}).outputFiles[0].text;
const loaded = { exports: {} as typeof import("../src/components/classroom/activity-choice-options") & typeof import("../src/components/classroom/activity-results") & typeof import("../src/components/classroom/activity-chat-card") & typeof import("../src/lib/i18n/context") };
new Function("require", "module", "exports", output)(createRequire(import.meta.url), loaded, loaded.exports);
const { ActivityChoiceOptions, ActivityResults, ActivitySolutions, ActivityChatCard, I18nProvider } = loaded.exports;
const q: ActivityQuestion = { id: "q", type: "single", prompt: "2 + 2 = ?", points: 10, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }, { id: "c", text: "6" }], correct: ["a"] };
const response = (answer: string | string[], score: number | null = 0): ActivityResponse => ({ id: "r", userId: "s", displayName: "Student", answers: { q: answer }, grading: { q: score }, feedback: null, submittedAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z", version: 1 });
const detail = (question = q, ownResponse: ActivityResponse | null = response(["b"])): ActivityDetail => ({ id: "a", title: question.prompt, kind: "quiz", status: "active", answerReleaseScope: "answered", resultsVisible: true, definition: { questions: [question] }, ownResponse, responses: [], responseCursor: null, statistics: null, questionCount: 1, responseCount: 1, version: 1, presented: false, presentedQuestion: 0, durationSec: null, startedAt: "2026-11-08T00:00:00Z", deadlineAt: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" });
function render(child: React.ReactNode) {
  // eslint-disable-next-line react/no-children-prop -- The typed SSR fixture provider requires its children prop.
  return renderToStaticMarkup(React.createElement(I18nProvider, { initialLocale: "zh-CN", children: child }));
}
function choices(question: ActivityQuestion, saved: ActivityResponse | null, reveal = true) { return render(React.createElement(ActivityChoiceOptions, { question, response: saved, reveal })); }

test("wrong single choice is marked on the checked option, with no duplicate answer paragraph", () => {
  const html = render(React.createElement(ActivityResults, { detail: detail() }));
  assert.match(html, /data-result="incorrect"[^>]*><input(?=[^>]*value="b")(?=[^>]*checked)[^>]*>/);
  assert.match(html, /data-result="correct"[^>]*><input[^>]*value="a"/);
  assert.match(html, /aria-label="错误"/);
  assert.doesNotMatch(html, /你的答案|正确答案：/);
});
test("multiple choice distinguishes selected errors, selected correct options, and missed correct options", () => {
  const html = choices({ ...q, type: "multiple", correct: ["a", "b"] }, response(["b", "c"]));
  assert.equal((html.match(/data-result="incorrect"/g) || []).length, 1);
  assert.equal((html.match(/data-result="correct"/g) || []).length, 2);
  assert.equal((html.match(/漏选/g) || []).length, 1);
  assert.equal((html.match(/checked=""/g) || []).length, 2);
});
test("boolean feedback uses the same inline red and green states", () => {
  const html = choices({ ...q, type: "boolean", options: [{ id: "a", text: "正确" }, { id: "b", text: "错误" }] }, response(["b"]));
  assert.match(html, /data-result="incorrect"[^>]*><input(?=[^>]*type="radio")(?=[^>]*value="b")(?=[^>]*checked)[^>]*>/);
  assert.equal((html.match(/data-result="correct"/g) || []).length, 1);
});
test("correct and unanswered students retain their own selection and compact grade/status", () => {
  const correct = choices(q, response(["a"], 10));
  assert.doesNotMatch(correct, /data-result="incorrect"/);
  assert.match(correct, /aria-label="得分">10 \/ 10/);
  const none = choices({ ...q, type: "multiple", correct: ["a", "b"] }, null);
  assert.match(none, /未作答/); assert.doesNotMatch(none, /checked=""|漏选|data-result="incorrect"/);
});
test("unreleased answers cannot produce feedback, even if a stale object still contains a key", () => {
  assert.doesNotMatch(choices(q, response(["b"]), false), /data-result=|data-judgment=|aria-label="错误"|aria-label="正确答案"/);
  assert.equal(render(React.createElement(ActivityResults, { detail: { ...detail(), resultsVisible: false } })), "");
});
test("the floating form omits duplicate choice results while retaining written-answer feedback", () => {
  assert.equal(render(React.createElement(ActivityResults, { detail: detail(), includeChoices: false })), "");
  const written = { ...q, type: "essay" as const, options: [], correct: undefined };
  const html = render(React.createElement(ActivityResults, { detail: detail(written, response("My reasoning", null)), includeChoices: false }));
  assert.match(html, /待批阅/); assert.match(html, /My reasoning/);
});
test("student explanations do not repeat choice keys; teacher solutions keep their keys", () => {
  const data = detail({ ...q, explanation: "Two pairs make four." });
  const html = render(React.createElement(ActivitySolutions, { detail: data, expanded: true, hideChoiceAnswers: true }));
  assert.match(html, /Two pairs make four/); assert.doesNotMatch(html, /<b>正确答案/);
  assert.match(render(React.createElement(ActivitySolutions, { detail: data })), /<b>正确答案/);
});
test("submitted-only release offers viewing rather than editing in the student chat card", () => {
  const data = detail();
  const html = render(React.createElement(ActivityChatCard, { activity: data, initialDetail: data, sessionId: "feedback", student: true, onChanged() {}, onManage() {} }));
  assert.match(html, />查看答案<\/button>/); assert.doesNotMatch(html, />修改<\/button>/);
});
