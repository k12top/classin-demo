# Live Summary Long Formula Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make long LaTeX chart labels readable across two lines and reveal their complete rendered content on hover or keyboard focus.

**Architecture:** Keep the ECharts plot and the existing React/KaTeX label overlay separate. Give both layers the same fixed 56px row geometry, then add a CSS-controlled full-content popover to each label trigger.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, React Markdown, KaTeX, ECharts 6, Node test runner

**Spec:** `docs/superpowers/specs/2026-11-12-live-summary-long-formula-labels-design.md`

## Global Constraints

- Keep page size, sorting, grading, chart data, and bar selection unchanged.
- Reuse `MarkdownInlineContent`/`MarkdownContent`; do not add dependencies or raw HTML rendering.
- Clamp visible labels to exactly two lines and use a 56px question row.
- Full content must work with mouse hover and keyboard focus on narrow viewports.

## Review Focus

- Plain text without LaTeX remains readable and does not gain unnecessary horizontal overflow.
- A long inline formula clamps to two lines while its popover contains complete KaTeX output.
- Keyboard focus reveals the same complete content as hover.
- Six labels still align one-to-one with six bars after the row-height change.
- The popover stays within the chart on a narrow viewport and does not block bar clicks when closed.

---

### Task 1: Two-line math label and complete-content popover

**Files:**
- Modify: `src/components/classroom/activity-overview-charts.tsx`
- Modify: `src/components/classroom/activity-overview.module.css`
- Modify: `tests/integration/classroom-activity-math-ui.cjs`
- Test: `tests/classroom-activity-charts.test.ts`

**Interfaces:**
- Consumes: `QuestionChartRow.prompt`, `MarkdownInlineContent`, and `MarkdownContent`.
- Produces: a 56px-per-row chart frame with a focusable label trigger and full rendered popover.

- [ ] **Step 1: Extend the browser regression fixture**

Add a deliberately long prompt containing `String.raw` LaTeX. Assert that the summary label has two-line clamp styling, the popover contains complete KaTeX, hover and focus expose it, and the document does not overflow a 390px viewport.

- [ ] **Step 2: Run the regression to verify it fails**

Run: `npx electron tests/integration/classroom-activity-math-ui.cjs`

Expected: FAIL because the current label is single-line, non-focusable, and has no full-content popover.

- [ ] **Step 3: Pin chart geometry in the unit test**

Update the question-chart test to assert the chart height calculation uses a shared exported `QUESTION_CHART_ROW_HEIGHT` value of `56` and continues to hide ECharts' plain-text Y-axis labels.

- [ ] **Step 4: Implement the label trigger and popover**

In `activity-overview-charts.tsx`, export `QUESTION_CHART_ROW_HEIGHT = 56`, use it for frame height, render the clamped inline label in a focusable trigger, and render the complete prompt in a sibling popover with `MarkdownContent`. Preserve keys and `aria-hidden` behavior for the duplicate chart visualization while providing an explicit accessible label on the trigger.

- [ ] **Step 5: Implement bounded two-line and popover styling**

In `activity-overview.module.css`, replace single-line truncation with a two-line clamp, align each grid row to 56px, reveal the popover on `:hover` and `:focus-within`, constrain it to the chart width, and keep closed labels from intercepting plot interactions outside their own trigger.

- [ ] **Step 6: Run focused verification**

Run: `node --import tsx --test tests/classroom-activity-charts.test.ts tests/markdown-content.test.tsx`

Expected: all tests PASS.

Run: `npx tsc --noEmit && npx eslint src/components/classroom/activity-overview-charts.tsx src/components/classroom/activity-overview.module.css tests/classroom-activity-charts.test.ts tests/integration/classroom-activity-math-ui.cjs`

Expected: zero errors.

- [ ] **Step 7: Run production and branch verification**

Run: `DATABASE_URL=postgresql://codex:codex@127.0.0.1:5432/codex npm run build`

Expected: production build exits 0.

Run: `DATABASE_URL=postgresql://codex:codex@127.0.0.1:5432/codex npm test`

Expected: no new failures beyond the three existing classroom video-budget assertions on `origin/main`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers src/components/classroom/activity-overview-charts.tsx src/components/classroom/activity-overview.module.css tests/classroom-activity-charts.test.ts tests/integration/classroom-activity-math-ui.cjs
git commit -m "improve long formula chart labels"
```
