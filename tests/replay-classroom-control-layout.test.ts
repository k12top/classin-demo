import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const playbackSource = readFileSync(
  new URL("../src/app/courses/[id]/playback/page.tsx", import.meta.url),
  "utf8",
);
const activityStyles = readFileSync(
  new URL("../src/components/classroom/activity-interaction.module.css", import.meta.url),
  "utf8",
);

test("speaker records render after the utterance timeline instead of inside the summary document", () => {
  const timelineStart = playbackSource.indexOf('{presentation === "timeline"');
  const speakers = playbackSource.indexOf("<SummarySpeakers", timelineStart);
  const timelineEnd = playbackSource.indexOf("function SummaryDocument", timelineStart);
  const summaryDocumentStart = playbackSource.indexOf("function SummaryDocument");
  const summaryDocumentEnd = playbackSource.indexOf("function SummaryTextarea", summaryDocumentStart);

  assert.ok(timelineStart >= 0);
  assert.ok(speakers > timelineStart && speakers < timelineEnd);
  assert.equal(
    playbackSource.slice(summaryDocumentStart, summaryDocumentEnd).includes("<SummarySpeakers"),
    false,
  );
});

test("the in-class response launcher sits to the right of the AI teacher only in the ClassIn layout", () => {
  assert.match(
    activityStyles,
    /:global\(\.is-classin-layout\)[^{]*\.questionReopen\s*\{[^}]*left:\s*82px/,
  );
  assert.match(activityStyles, /\.surface \.questionReopen\{[^}]*left:16px/);
});
