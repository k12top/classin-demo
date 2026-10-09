/* eslint-disable @typescript-eslint/no-require-imports -- Opt-in real provider check uses synthetic captions only. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
assert.equal(process.env.RUN_AI_SUMMARY_SMOKE, "1", "set RUN_AI_SUMMARY_SMOKE=1 to call the configured provider with synthetic captions");
async function main() {
  const env = require("dotenv").parse(await fs.readFile(path.join(root, ".env.local")));
  for (const [key, value] of Object.entries(env)) if (key.startsWith("AI_SUMMARY_")) process.env[key] = value;
  const output = path.join(root, "node_modules/.cache/classroom-summary-provider.cjs");
  await esbuild.build({ stdin: { contents: `export{generateCourseSessionAISummary,courseSessionAISummaryConfig}from'@/lib/course-session-ai-summary';export{buildCourseSessionSummaryDocument}from'@/lib/course-session-summary-document';export{summaryCaptions}from'./tests/fixtures/course-summary';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json") });
  const api = require(output);
  const config = api.courseSessionAISummaryConfig();
  assert.ok(config, "local summary provider must be enabled and configured");
  const started = Date.now(); let requests = 0;
  const document = await api.generateCourseSessionAISummary({ title: "判别式与求根公式（测试课程）", captions: api.summaryCaptions, fallback: api.buildCourseSessionSummaryDocument("代数课", api.summaryCaptions) }, { config, fetchImpl: async (url, init) => { const requestId = ++requests; const r = await fetch(url, init); console.log(`Provider request ${requestId}: HTTP ${r.status}`); return r; } });
  assert.equal(document.generation.method, "meeting-multi-agent");
  assert.match(document.overview, /判别式|求根/);
  assert.ok(document.report.participantSummaries.length >= 2);
  assert.ok(document.report.discussionThreads.length >= 1);
  assert.ok(document.report.actionItems.some(item => /十二|12/.test(item.title + item.description)));
  assert.ok(document.report.followUps.some(item => /配方/.test(item.topic + item.reason)));
  assert.ok(document.report.actionItems.some(item => item.due === "下周二下午五点前" && item.owner === "全体同学"));
  const ids = new Set(api.summaryCaptions.map(item => item.id));
  for (const section of Object.values(document.report)) for (const item of section) assert.ok(item.evidence.captionIds.length && item.evidence.captionIds.every(id => ids.has(id)));
  const directory = path.join(root, "outputs/classroom-ai-summary-2026-10-10");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "synthetic-provider-report.json"), JSON.stringify(document, null, 2));
  console.log(JSON.stringify({ model: config.model, style: config.apiStyle, requests, elapsedSeconds: Math.round((Date.now() - started) / 1000), participants: document.report.participantSummaries.length, threads: document.report.discussionThreads.length, actions: document.report.actionItems.length, conclusions: document.report.conclusions.length, followUps: document.report.followUps.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
