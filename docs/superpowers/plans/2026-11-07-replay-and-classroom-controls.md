# Replay and Classroom Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition replay speaker records and the in-class response launcher to match the requested hierarchy.

**Architecture:** Reuse the existing summary payload in the timeline presentation and scope the launcher offset through the ClassIn layout ancestor. No API or state model changes are needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner

**Spec:** `docs/superpowers/specs/2026-11-07-replay-and-classroom-controls-design.md`

## Global Constraints

- Preserve existing data and interactions.
- Apply the activity launcher offset only to the ClassIn layout.
- Follow the checked-in Next.js 16 documentation.

## Review Focus

- A missing summary must not break the timeline.
- An empty speakers array must show the existing empty state.
- Mobile timeline mode must keep the speaker list below captions.
- Non-ClassIn classroom layouts must keep the original activity launcher position.
- The ClassIn activity launcher must remain keyboard accessible.

---

### Task 1: Lock the requested layout in regression tests

**Files:**
- Create: `tests/replay-classroom-control-layout.test.ts`

**Interfaces:**
- Consumes: replay page and classroom CSS module source.
- Produces: regression assertions for component order and scoped positioning.

- [ ] Write source-level tests that fail on the current placement.
- [ ] Run the focused test and confirm the expected failures.

### Task 2: Move the replay speaker record

**Files:**
- Modify: `src/app/courses/[id]/playback/page.tsx`

**Interfaces:**
- Consumes: `summary.document.speakers` and `copy.speakers`.
- Produces: `SummarySpeakers` rendered after the timeline card.

- [ ] Extract the speaker list into a focused component.
- [ ] Render it below the timeline when summary data exists.
- [ ] Remove it from the summary document grid.
- [ ] Run the focused test.

### Task 3: Reposition the classroom response launcher

**Files:**
- Modify: `src/components/classroom/activity-interaction.module.css`

**Interfaces:**
- Consumes: `.is-classin-layout` ancestor and `.questionReopen` launcher.
- Produces: a ClassIn-only horizontal offset to the right of the AI teacher launcher.

- [ ] Add the scoped CSS rule.
- [ ] Run the focused test.
- [ ] Run the full test, lint, and build verification commands.

