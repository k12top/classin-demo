export const ACTIVITY_REFRESH_EVENT = "classroom-activity-refresh";
/** Shared validation, grading and wire types; answer keys are server-owned. */
export type ActivityKind = "poll" | "quiz" | "task";
export type QuestionKind = "single" | "multiple" | "boolean" | "shortText" | "essay";
export type ActivityStatus = "draft" | "active" | "closed" | "published" | "cancelled";
export type ActivityQuestion = {
  id: string; type: QuestionKind; prompt: string; points: number;
  options: Array<{ id: string; text: string }>;
  correct?: string[];
};
export type ActivityDefinition = { questions: ActivityQuestion[] };
export type ActivityAnswers = Record<string, string | string[]>;
/** Choice order and surrounding text whitespace do not change an answer. */
export function answersMatch(a: ActivityAnswers, b: ActivityAnswers): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => {
    const left = a[key], right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      const sorted = [...right].sort();
      return left.length === right.length && [...left].sort().every((value, index) => value === sorted[index]);
    }
    return typeof left === "string" && typeof right === "string" && left.trim() === right.trim();
  });
}
export type ActivityGrade = Record<string, number | null>;
export type ActivitySummary = {
  id: string; title: string; kind: ActivityKind; status: ActivityStatus;
  durationSec: number | null; startedAt: string | null; deadlineAt: string | null;
  version: number; presented: boolean; presentedQuestion: number; createdAt: string; updatedAt: string; responseCount: number; questionCount: number;
};
export type ActivityResponse = {
  id: string; userId: string; displayName: string; answers: ActivityAnswers;
  grading: ActivityGrade | null; feedback: string | null; submittedAt: string; updatedAt: string; version: number;
};
export type ActivityDetail = ActivitySummary & {
  definition: ActivityDefinition; ownResponse: ActivityResponse | null;
  responses: ActivityResponse[]; responseCursor: string | null;
  statistics: Record<string, Record<string, number>> | null;
};
export type ActivityList = {
  activities: ActivitySummary[]; nextCursor: string | null; active: ActivitySummary | null;
  canManage: boolean; canAnswer: boolean; canPrepare: boolean; live: boolean;
};
export type ActivityPresentation = { id: string; title: string; kind: ActivityKind; status: ActivityStatus; questionCount: number; index: number; question: ActivityQuestion; responseCount: number; statistics: Record<string, number> | null };
export class ActivityError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "ActivityError"; }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActivityError("Invalid activity data");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new ActivityError("Invalid or empty text");
  return value.trim();
}
export function validateActivity(value: unknown): { title: string; kind: ActivityKind; definition: ActivityDefinition; durationSec: number | null } {
  const v = object(value);
  if (!["poll", "quiz", "task"].includes(String(v.kind))) throw new ActivityError("Unknown activity kind");
  const kind = v.kind as ActivityKind;
  const raw = object(v.definition).questions;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50 || (kind !== "quiz" && raw.length !== 1)) throw new ActivityError("Invalid question count");
  const ids = new Set<string>();
  const questions = raw.map((value): ActivityQuestion => {
    const q = object(value), id = text(q.id, 80);
    if (ids.has(id) || ["__proto__", "constructor", "prototype"].includes(id) || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new ActivityError("Duplicate or invalid question ID");
    ids.add(id);
    if (!["single", "multiple", "boolean", "shortText", "essay"].includes(String(q.type))) throw new ActivityError("Unknown question type");
    const type = q.type as QuestionKind;
    const choice = ["single", "multiple", "boolean"].includes(type);
    if ((kind === "poll" && !choice) || (kind === "task" && type !== "essay")) throw new ActivityError("Question does not match activity");
    const points = kind === "poll" ? 0 : q.points;
    if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > 100) throw new ActivityError("Invalid points");
    const options = choice && Array.isArray(q.options) ? q.options.map((v) => { const o = object(v); return { id: text(o.id, 80), text: text(o.text, 500) }; }) : [];
    if (choice && (options.length < 2 || options.length > 8 || (type === "boolean" && options.length !== 2))) throw new ActivityError("Use two to eight options");
    if (new Set(options.map(o => o.id)).size !== options.length || options.some(o => ["__proto__", "constructor", "prototype"].includes(o.id) || !/^[a-zA-Z0-9_-]+$/.test(o.id))) throw new ActivityError("Duplicate or invalid option ID");
    let correct: string[] | undefined;
    if (kind === "quiz" && type !== "essay") {
      if (!Array.isArray(q.correct) || !q.correct.length || q.correct.length > 20) throw new ActivityError("Set a correct answer");
      correct = [...new Set(q.correct.map(a => text(a, 2000)))];
      if (choice && correct.some(a => !options.some(o => o.id === a))) throw new ActivityError("Correct answer is not an option");
      if ((type === "single" || type === "boolean") && correct.length !== 1) throw new ActivityError("Select one correct answer");
    }
    return { id, type, prompt: text(q.prompt, 4000), points, options, ...(correct ? { correct } : {}) };
  });
  const durationSec = v.durationSec == null ? null : v.durationSec;
  if (durationSec !== null && (typeof durationSec !== "number" || !Number.isInteger(durationSec) || durationSec < 10 || durationSec > 86400)) throw new ActivityError("Duration must be 10 seconds to 24 hours");
  return { title: text(v.title, 200), kind, definition: { questions }, durationSec };
}
export function validateAnswers(definition: ActivityDefinition, value: unknown): ActivityAnswers {
  const raw = object(value), result: ActivityAnswers = {};
  if (Object.keys(raw).some(id => !definition.questions.some(q => q.id === id))) throw new ActivityError("Unknown answer question");
  for (const q of definition.questions) {
    const answer = raw[q.id];
    if (q.type === "essay" || q.type === "shortText") result[q.id] = text(answer, 10000);
    else {
      const items = Array.isArray(answer) ? answer : [answer];
      if (!items.length || items.length > q.options.length || items.some(a => typeof a !== "string" || !q.options.some(o => o.id === a)) || new Set(items).size !== items.length || (q.type !== "multiple" && items.length !== 1)) throw new ActivityError("Select a valid answer for every question");
      result[q.id] = items as string[];
    }
  }
  return result;
}
function normal(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase(); }
export function gradeAnswers(kind: ActivityKind, definition: ActivityDefinition, answers: ActivityAnswers): ActivityGrade {
  return Object.fromEntries(definition.questions.map(q => {
    if (kind === "poll") return [q.id, 0];
    if (q.type === "essay") return [q.id, null];
    const answer = answers[q.id];
    const correct = q.correct || [];
    const pass = typeof answer === "string" ? correct.some(c => normal(c) === normal(answer)) : answer.length === correct.length && correct.every(c => answer.includes(c));
    return [q.id, pass ? q.points : 0];
  }));
}
export function publicDefinition(definition: ActivityDefinition, reveal: boolean): ActivityDefinition {
  return { questions: definition.questions.map(q => {
    const { correct, ...safe } = q;
    return reveal && correct ? { ...safe, correct } : safe;
  }) };
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  // Spreadsheet formula injection includes leading whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function activityCsv(definition: ActivityDefinition, rows: ActivityResponse[]): string {
  const headers = ["User ID", "Name", "Submitted at", ...definition.questions.flatMap((q, i) => [`Q${i + 1}: ${q.prompt}`, `Q${i + 1} score`]), "Total", "Feedback"];
  return "\ufeff" + [headers, ...rows.map(row => [row.userId, row.displayName, row.submittedAt, ...definition.questions.flatMap(q => {
    const value = row.answers[q.id];
    return [Array.isArray(value) ? value.map(id => q.options.find(o => o.id === id)?.text || id).join("; ") : value, row.grading?.[q.id] ?? "Pending"];
  }), row.grading && Object.values(row.grading).every(x => x !== null) ? Object.values(row.grading).reduce<number>((a, b) => a + (b || 0), 0) : "Pending", row.feedback])].map(r => r.map(csvCell).join(",")).join("\r\n");
}
