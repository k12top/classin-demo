import { summaryContent, summarySpeakerName, summarySpeakerReferences } from "./summary-content";
export type SummaryEvidence = { captionIds: string[]; occurredAt?: string };
export type SummaryAction = {
  title: string; owner: string; due: string; status: string; description: string;
  evidence: SummaryEvidence;
};
export type CourseSessionSummaryReport = {
  participantSummaries: Array<{
    speakerId: string; speakerName: string; summary: string;
    keyPoints: string[]; commitments: string[]; evidence: SummaryEvidence;
  }>;
  discussionThreads: Array<{
    topic: string; summary: string; participants: string[]; evidence: SummaryEvidence;
  }>;
  actionItems: SummaryAction[];
  conclusions: Array<{ title: string; detail: string; evidence: SummaryEvidence }>;
  followUps: Array<{
    topic: string; reason: string; owner: string; nextCheckAt: string; evidence: SummaryEvidence;
  }>;
};

export type CourseSessionSummaryDocument = {
  version: 1;
  title: string;
  overview: string;
  keyPoints: string[];
  questions: string[];
  actionItems: string[];
  // Additive fields keep existing stored summaries and API clients compatible.
  report?: CourseSessionSummaryReport;
  generation?: {
    method: "meeting-multi-agent" | "transcript-extract";
    model?: string;
    analyzedCaptionCount: number;
    totalCaptionCount: number;
    reason?: "disabled" | "unavailable";
  };
  speakers: Array<{
    id: string;
    name: string;
    utteranceCount: number;
    characterCount: number;
  }>;
};

export type CourseSessionSummaryCaption = {
  speakerId: string;
  speakerName: string;
  text: string;
  occurredAt: Date;
  updatedAt: Date;
};

type CaptionTurn = {
  speakerId: string;
  speakerName: string;
  text: string;
  occurredAt: Date;
  utteranceCount: number;
};

const MAX_SUMMARY_ITEMS = 8;
const MAX_ITEM_LENGTH = 360;

function cleanText(value: string, limit = MAX_ITEM_LENGTH) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function uniqueItems(items: string[], limit = MAX_SUMMARY_ITEMS) {
  const seen = new Set<string>();
  return items.map((item) => cleanText(item)).filter((normalized) => {
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, limit);
}

function buildTurns(captions: CourseSessionSummaryCaption[]): CaptionTurn[] {
  const turns: CaptionTurn[] = [];
  for (const caption of captions) {
    const text = cleanText(summaryContent(caption.text), 1_200);
    if (!text) continue;
    const speakerId = caption.speakerId || "unknown";
    const speakerName = summarySpeakerName(caption.speakerName).slice(0, 80);
    const previous = turns.at(-1);
    if (
      previous &&
      previous.speakerId === speakerId &&
      caption.occurredAt.getTime() - previous.occurredAt.getTime() < 90_000
    ) {
      previous.text = cleanText(`${previous.text} ${text}`, 1_200);
      previous.utteranceCount += 1;
      continue;
    }
    turns.push({ speakerId, speakerName, text, occurredAt: caption.occurredAt, utteranceCount: 1 });
  }
  return turns;
}

function scoreTurn(turn: CaptionTurn) {
  const question = /[?？]/.test(turn.text) ? 90 : 0;
  const action = /作业|练习|提交|复习|阅读|下次课|课后|截止/.test(turn.text) ? 70 : 0;
  return question + action + Math.min(turn.text.length, 240) / 8;
}

function defaultDocument(title: string): CourseSessionSummaryDocument {
  return {
    version: 1,
    title: cleanText(title, 160) || "课堂课后总结",
    overview: "暂无最终字幕。开启实时字幕后，可重新生成课后总结。",
    keyPoints: [], questions: [], actionItems: [], speakers: [],
    generation: { method: "transcript-extract", analyzedCaptionCount: 0, totalCaptionCount: 0, reason: "disabled" },
  };
}

export function buildCourseSessionSummaryDocument(
  lessonTitle: string,
  captions: CourseSessionSummaryCaption[],
): CourseSessionSummaryDocument {
  const finalCaptions = captions
    .filter((caption) => cleanText(caption.text).length > 0)
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  if (finalCaptions.length === 0) return defaultDocument(lessonTitle);

  const turns = buildTurns(finalCaptions);
  const speakerMap = new Map<string, CourseSessionSummaryDocument["speakers"][number]>();
  for (const caption of finalCaptions) {
    const id = caption.speakerId || "unknown";
    const current = speakerMap.get(id) || {
      id,
      name: summarySpeakerName(caption.speakerName).slice(0, 80),
      utteranceCount: 0,
      characterCount: 0,
    };
    current.utteranceCount += 1;
    current.characterCount += cleanText(caption.text, 20_000).length;
    speakerMap.set(id, current);
  }
  const selectedTurns = [...turns]
    .sort((left, right) => scoreTurn(right) - scoreTurn(left))
    .slice(0, MAX_SUMMARY_ITEMS * 2);
  const speakers = [...speakerMap.values()].sort(
    (left, right) => right.characterCount - left.characterCount,
  );
  const start = finalCaptions[0]!.occurredAt;
  const end = finalCaptions.at(-1)!.occurredAt;
  const spanMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
  return {
    version: 1,
    title: cleanText(lessonTitle, 160) || "课堂课后总结",
    overview: `本节课沉淀了 ${finalCaptions.length} 条最终发言，覆盖 ${speakers.length} 位发言人，记录跨度约 ${spanMinutes} 分钟。以下内容由字幕提炼而来，请在发布前审核。`,
    keyPoints: uniqueItems(selectedTurns.map((turn) => turn.text)),
    questions: uniqueItems(turns.filter((turn) => /[?？]/.test(turn.text)).map((turn) => turn.text), 5),
    actionItems: uniqueItems(turns.filter((turn) => /作业|练习|提交|复习|阅读|下次课|课后|截止/.test(turn.text)).map((turn) => turn.text), 5),
    speakers,
    generation: { method: "transcript-extract", analyzedCaptionCount: finalCaptions.length, totalCaptionCount: finalCaptions.length, reason: "disabled" },
  };
}

function stringsFrom(value: unknown, limit = MAX_SUMMARY_ITEMS) {
  if (!Array.isArray(value)) return [];
  return uniqueItems(value.filter((item): item is string => typeof item === "string"), limit);
}

function speakersFrom(
  value: unknown,
  fallback: CourseSessionSummaryDocument["speakers"],
) {
  if (!Array.isArray(value)) return fallback;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? cleanText(record.id, 240) : "";
    const name = typeof record.name === "string" ? cleanText(record.name, 80) : "";
    if (!id || !name) return [];
    return [{
      id,
      name: summarySpeakerName(name),
      utteranceCount: Math.max(0, Number(record.utteranceCount) || 0),
      characterCount: Math.max(0, Number(record.characterCount) || 0),
    }];
  }).slice(0, 100);
}

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function textFrom(value: unknown, limit = 1_200) {
  return typeof value === "string" ? cleanText(value, limit) : "";
}
// Older model output sometimes copied internal references into prose. Keep the
// structured evidence for playback, but never show these annotations as content.
const withoutReferenceAnnotations = summaryContent;
function summaryTextFrom(value: unknown, limit = 1_200) {
  return textFrom(typeof value === "string" ? withoutReferenceAnnotations(value) : value, limit);
}
function summaryStringsFrom(value: unknown, limit = MAX_SUMMARY_ITEMS) {
  return stringsFrom(Array.isArray(value) ? value.map((item) => typeof item === "string" ? withoutReferenceAnnotations(item) : item) : value, limit);
}
function recordsFrom(value: unknown, limit = 12) {
  return Array.isArray(value) ? value.slice(0, limit).map(objectFrom) : [];
}
function evidenceFrom(value: unknown): SummaryEvidence {
  const record = objectFrom(value);
  const occurredAt = textFrom(record.occurredAt, 40);
  return {
    captionIds: stringsFrom(record.captionIds, 16),
    ...(occurredAt && Number.isFinite(Date.parse(occurredAt)) ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
  };
}

export function normalizeCourseSessionSummaryReport(value: unknown): CourseSessionSummaryReport {
  const record = objectFrom(value);
  return {
    participantSummaries: recordsFrom(record.participantSummaries, 100).map((item) => ({
      speakerId: textFrom(item.speakerId, 240), speakerName: summaryTextFrom(item.speakerName, 80),
      summary: summaryTextFrom(item.summary), keyPoints: summaryStringsFrom(item.keyPoints),
      commitments: summaryStringsFrom(item.commitments), evidence: evidenceFrom(item.evidence),
    })).filter((item) => item.speakerId && item.speakerName && item.summary),
    discussionThreads: recordsFrom(record.discussionThreads).map((item) => ({
      topic: summaryTextFrom(item.topic, 160), summary: summaryTextFrom(item.summary),
      participants: summaryStringsFrom(item.participants, 100), evidence: evidenceFrom(item.evidence),
    })).filter((item) => item.topic && item.summary),
    actionItems: recordsFrom(record.actionItems, 20).map((item) => ({
      title: summaryTextFrom(item.title), owner: summaryTextFrom(item.owner, 160), due: summaryTextFrom(item.due, 160),
      status: ["pending", "in-progress", "completed", "blocked", "cancelled"].includes(String(item.status)) ? String(item.status) : "pending",
      description: summaryTextFrom(item.description), evidence: evidenceFrom(item.evidence),
    })).filter((item) => item.title),
    conclusions: recordsFrom(record.conclusions).map((item) => ({
      title: summaryTextFrom(item.title, 360), detail: summaryTextFrom(item.detail), evidence: evidenceFrom(item.evidence),
    })).filter((item) => item.title),
    followUps: recordsFrom(record.followUps).map((item) => ({
      topic: summaryTextFrom(item.topic, 360), reason: summaryTextFrom(item.reason),
      owner: summaryTextFrom(item.owner, 160), nextCheckAt: summaryTextFrom(item.nextCheckAt, 160),
      evidence: evidenceFrom(item.evidence),
    })).filter((item) => item.topic),
  };
}

function generationFrom(value: unknown): CourseSessionSummaryDocument["generation"] {
  const record = objectFrom(value);
  if (record.method !== "meeting-multi-agent" && record.method !== "transcript-extract") return undefined;
  const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  return {
    method: record.method,
    ...(typeof record.model === "string" ? { model: cleanText(record.model, 160) } : {}),
    analyzedCaptionCount: count(record.analyzedCaptionCount), totalCaptionCount: count(record.totalCaptionCount),
    ...(record.reason === "disabled" || record.reason === "unavailable" ? { reason: record.reason } : {}),
  };
}

export function normalizeCourseSessionSummaryDocument(
  value: unknown,
  fallback?: CourseSessionSummaryDocument,
): CourseSessionSummaryDocument {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? { ...value as Record<string, unknown> } : {};
  const defaults = fallback || defaultDocument("");
  const names = new Map<string, string>();
  for (const speaker of speakersFrom(record.speakers, defaults.speakers)) names.set(speaker.id, summarySpeakerName(speaker.name));
  for (const participant of recordsFrom(objectFrom(record.report).participantSummaries, 100)) {
    if (typeof participant.speakerId === "string" && typeof participant.speakerName === "string" && (!names.has(participant.speakerId) || names.get(participant.speakerId) === "发言人")) names.set(participant.speakerId, summarySpeakerName(participant.speakerName));
  }
  for (const section of Object.values(objectFrom(record.report))) {
    for (const item of recordsFrom(section, 100)) {
      for (const id of stringsFrom(objectFrom(item.evidence).captionIds, 16)) {
        if (!names.has(id)) names.set(id, "");
      }
    }
  }
  const clean = (value: unknown, key = ""): unknown => {
    if (["id", "speakerId", "captionIds", "occurredAt", "generation"].includes(key)) return value;
    if (typeof value === "string") return summarySpeakerReferences(value, names);
    if (Array.isArray(value)) return value.map(item => clean(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
    return value;
  };
  for (const key of Object.keys(record)) record[key] = clean(record[key], key);
  const reportInput = record.report === undefined ? defaults.report : record.report;
  const report = reportInput && typeof reportInput === "object" ? normalizeCourseSessionSummaryReport(reportInput) : undefined;
  return {
    version: 1,
    title: summaryTextFrom(typeof record.title === "string" ? record.title : defaults.title, 160) || defaults.title,
    overview: summaryTextFrom(typeof record.overview === "string" ? record.overview : defaults.overview, 4_000),
    keyPoints: summaryStringsFrom(record.keyPoints, MAX_SUMMARY_ITEMS),
    questions: summaryStringsFrom(record.questions, 8),
    actionItems: report ? report.actionItems.map((item) => item.title) : summaryStringsFrom(record.actionItems, 20),
    speakers: speakersFrom(record.speakers, defaults.speakers),
    ...(report ? { report } : {}),
    ...(generationFrom(record.generation ?? fallback?.generation) ? { generation: generationFrom(record.generation ?? fallback?.generation) } : {}),
  };
}
