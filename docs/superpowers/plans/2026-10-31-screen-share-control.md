# Screen Share Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the space-consuming local screen-share banner with an unmistakable, one-click “退出共享” dock control whose status treatment indicates active sharing.

**Architecture:** Keep the existing media-provider and `toggleScreenShare` lifecycle unchanged. Derive the dock presentation from `controlMedia.local.screenSharing`, remove only the redundant prepared banner for the active local share, and preserve screen-share settings through the existing secondary menu.

**Tech Stack:** Next.js 16, React, TypeScript, CSS, Lucide icons, Node test runner

**Spec:** `docs/superpowers/specs/2026-10-31-screen-share-control-design.md`

## Global Constraints

- Do not change Agora/browser capture, permissions, leases, or server runtime behavior.
- Preserve screen-share settings and student invitation/readiness flows.
- Support light, dark, desktop, compact, keyboard, screen-reader, and reduced-motion states.
- Read the relevant Next.js guide before editing application code.

## Review Focus

- A local share that has started must show the active dock state immediately and stop on one click.
- A remote/student share must not make the teacher’s local share button claim “正在共享”.
- Compact layouts must retain a visible status treatment even when button text is hidden.
- The active treatment must remain legible in both light and dark themes.
- Users requesting reduced motion must not receive a pulsing animation.

---

### Task 1: Local sharing state control

**Files:**
- Modify: `src/components/classroom/classroom-v3.tsx`
- Modify: `src/app/classroom-classin.css`
- Modify: `src/app/classroom-responsive.css`
- Modify: `src/lib/i18n/locales/zh-CN.ts`
- Modify: `src/lib/i18n/locales/en.ts`
- Create: `src/components/classroom/screen-share-dock-button.tsx`
- Test: `tests/classroom-screen-share-control.test.ts`

**Interfaces:**
- Consumes: `controlMedia.local.screenSharing`, `stopLocalSharing`, `toggleScreenShare`, and existing i18n keys `classroom.v3.screenShare`, `classroom.v3.stopSharing`, `classroomMultiShare.live`.
- Produces: `button[data-dock-action="share"][data-sharing="true"]` as the stable active-state hook; no new media API.

- [x] **Step 1: Write the failing structural regression test**

Assert that the classroom source removes `.classroom-screen-prepared`, renders the share dock button with `data-sharing`, uses a stop icon and “退出共享” label while local sharing is true, exposes the tooltip “正在共享，点击退出”, and directly invokes `stopLocalSharing`; assert the non-sharing branch still invokes `toggleScreenShare`.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `node --import tsx --test tests/classroom-screen-share-control.test.ts`

Expected: FAIL because the current active branch renders `Settings2`, labels the action as sharing settings, and still renders the prepared banner.

- [x] **Step 3: Implement the stateful dock action**

In `src/components/classroom/classroom-v3.tsx`, remove only the active local-share banner. Change the dock share control so the active branch uses `CircleStop`, `classroomMultiShare.live`, `aria-pressed`, `aria-label`, `title`, `data-sharing="true"`, and `stopLocalSharing`; keep the inactive branch on `MonitorUp` and `toggleScreenShare`. Mirror accurate stop/share labels in compact and overflow actions without changing the settings menu component.

- [x] **Step 4: Add restrained active-state styling**

In the ClassIn and responsive styles, give `[data-dock-action="share"][data-sharing="true"]` a theme-aware emphasized surface, border/ring, and a small status indicator. Animate only the indicator, wrap the animation in `@media (prefers-reduced-motion: no-preference)`, and ensure the icon-only compact state remains visibly active.

- [x] **Step 5: Run focused and related tests**

Run: `node --import tsx --test tests/classroom-screen-share-control.test.ts tests/classroom-screen-share-lifecycle.test.ts tests/classroom-screen-permissions.test.ts`

Expected: all tests pass.

- [x] **Step 6: Run full verification**

Run: `npm test`

Expected: all tests pass when `DATABASE_URL` is loaded from `.env.local;` then run `npm run build` and expect exit code 0.

- [x] **Step 7: Inspect the live UI once at desktop and compact widths**

Verify the banner is absent, the sharing control is visible without covering content, one click stops sharing, settings remain accessible, and light/dark contrast is clear. Apply at most one batched correction pass.

- [x] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-10-31-screen-share-control-design.md docs/superpowers/plans/2026-10-31-screen-share-control.md src/components/classroom/classroom-v3.tsx src/app/classroom-classin.css src/app/classroom-responsive.css tests/classroom-screen-share-control.test.ts
git commit -m "fix(classroom): simplify active screen sharing control"
```
