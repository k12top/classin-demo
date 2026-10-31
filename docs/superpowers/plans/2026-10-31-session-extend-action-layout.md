# Session Extend Action Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the course-session extend action compact without vertical text while preserving hover and assistive-technology hints.

**Architecture:** Add an explicit `compact` presentation option to the shared timing control and enable it only from the session-row action area. Test rendered behavior rather than relying on source-text assertions.

**Tech Stack:** React 19, TypeScript, CSS Modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-31-session-extend-action-layout-design.md`

## Global Constraints

- Do not change non-session-list timing controls.
- The compact trigger must expose “延长课程” through both `title` and `aria-label`.
- The 15/30/60-minute dropdown behavior remains unchanged.
- Do not include unrelated local database changes in this UI task.

## Review Focus

- Live lessons show the compact extend action without vertical text.
- Ended/restart wording remains action-specific if compact mode is reused.
- Non-compact classroom controls retain their visible label.
- Keyboard and screen-reader names remain available.
- Mobile touch targets retain the existing 44px responsive sizing.

---

### Task 1: Compact timing-control presentation

**Files:**
- Modify: `src/components/classroom/class-timing-controls.tsx`
- Modify: `src/components/course-sessions/course-session-manager.tsx`
- Modify: `src/components/course-sessions/course-session-manager.module.css`
- Test: `tests/class-timing-controls.test.tsx`

**Interfaces:**
- Consumes: existing `ClassTimingControls` props and translations.
- Produces: optional `compact?: boolean` presentation behavior.

- [x] **Step 1: Write the failing rendered-component test**

Assert that compact mode exposes action-specific `title` and `aria-label`, hides the visible trigger label, retains the menu options, and that default mode keeps the visible label.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/class-timing-controls.test.tsx`
Expected: FAIL because `compact` behavior is not implemented.

- [x] **Step 3: Implement the minimal compact mode**

Add `compact?: boolean`, an action-specific accessible label, a scoped compact class, and pass `compact` from `CourseSessionManager`.

- [x] **Step 4: Run targeted verification**

Run the new test and ESLint for the touched files; expect zero failures.

- [x] **Step 5: Verify the real page**

Run the local app, inspect a live session row at desktop and responsive widths, open the dropdown, and confirm the trigger does not create horizontal overflow.

- [x] **Step 6: Commit only the UI repair**

Stage the component, CSS, test, spec, and plan files without staging unrelated database changes. Commit with `fix(courses): keep extend action compact`.
