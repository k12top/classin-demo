import assert from "node:assert/strict";
import test from "node:test";
import type { ReactElement } from "react";
import { LessonSummaryReport } from "../src/components/course-sessions/lesson-summary-report";
import type { CourseSessionSummaryReport } from "../src/lib/course-session-summary-document";

test("participant summary cards have unique keys when one speaker has multiple summaries", () => {
  const participant = {
    speakerId: "speaker-1",
    speakerName: "Speaker",
    summary: "Summary",
    keyPoints: [],
    commitments: [],
    evidence: { captionIds: [] },
  };
  const report: CourseSessionSummaryReport = {
    participantSummaries: [participant, { ...participant, summary: "Another summary" }],
    discussionThreads: [],
    actionItems: [],
    conclusions: [],
    followUps: [],
  };

  const tree = LessonSummaryReport({ report, locale: "en" }) as ReactElement<{ children: ReactElement[] }>;
  const participantSection = tree.props.children[1] as ReactElement<{ children: ReactElement[] }>;
  const cards = participantSection.props.children;
  const keys = cards.map((card) => card.key);

  assert.equal(new Set(keys).size, cards.length);
});
