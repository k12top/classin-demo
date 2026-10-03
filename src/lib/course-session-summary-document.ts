export type CourseSessionSummaryDocument = {
  version: 1;
  title: string;
  overview: string;
  keyPoints: string[];
  questions: string[];
  actionItems: string[];
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
  return items.filter((item) => {
    const normalized = cleanText(item);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, limit);
}

function buildTurns(captions: CourseSessionSummaryCaption[]): CaptionTurn[] {
  const turns: CaptionTurn[] = [];
  for (const caption of captions) {
    const text = cleanText(caption.text, 1_200);
    if (!text) continue;
    const speakerId = caption.speakerId || "unknown";
    const speakerName = cleanText(caption.speakerName, 80) || "发言人";
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
      name: cleanText(caption.speakerName, 80) || "发言人",
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
      name,
      utteranceCount: Math.max(0, Number(record.utteranceCount) || 0),
      characterCount: Math.max(0, Number(record.characterCount) || 0),
    }];
  }).slice(0, 100);
}

export function normalizeCourseSessionSummaryDocument(
  value: unknown,
  fallback?: CourseSessionSummaryDocument,
): CourseSessionSummaryDocument {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const defaults = fallback || defaultDocument("");
  return {
    version: 1,
    title: cleanText(typeof record.title === "string" ? record.title : defaults.title, 160) || defaults.title,
    overview: cleanText(typeof record.overview === "string" ? record.overview : defaults.overview, 2_000),
    keyPoints: stringsFrom(record.keyPoints, MAX_SUMMARY_ITEMS),
    questions: stringsFrom(record.questions, 5),
    actionItems: stringsFrom(record.actionItems, 5),
    speakers: speakersFrom(record.speakers, defaults.speakers),
  };
}
