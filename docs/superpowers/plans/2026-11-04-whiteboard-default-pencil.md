# Whiteboard Default Pencil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the classroom whiteboard select and apply the pencil tool on first entry.

**Architecture:** Change the single React state initializer that owns the selected whiteboard tool. Keep the existing controller synchronization effect so the UI selection and Netless appliance receive the same value when the controller becomes ready.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Netless Fastboard, Node/Electron integration tests

**Spec:** `docs/superpowers/specs/2026-11-04-whiteboard-default-pencil-design.md`

## Global Constraints

- The first writable whiteboard tool is `pencil`.
- Do not persist the selected tool or change shortcuts, screen annotation behavior, or drawing settings.
- Read the relevant bundled Next.js guide before editing application code.

## Review Focus

- Controller readiness after initial render must still apply `pencil`, not only highlight its button.
- A later manual tool selection must continue to replace the default.
- Screen annotation must retain its existing tool mapping behavior.
- Recorder and read-only classroom surfaces must not gain write capability.
- Whiteboard retry/remount must use the current selected tool rather than resetting user choice.

---

### Task 1: Default the classroom whiteboard to pencil

**Files:**
- Modify: `src/components/classroom/classroom-v3.tsx:3544-3546`
- Modify: `tests/helpers/classroom-browser-fixture.cjs`
- Modify: `tests/integration/classroom-responsive-ui.cjs`

**Interfaces:**
- Consumes: `ClassroomWhiteboardTool` and the existing `whiteboardController?.setTool(whiteboardTool)` synchronization effect.
- Produces: initial `whiteboardTool === "pencil"`; fixture evidence of the first controller `setTool` call.

- [ ] **Step 1: Read the bundled Next.js client-component guide**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

Expected: confirm state remains inside the existing client component; no server boundary change is needed.

- [ ] **Step 2: Write the failing browser regression**

Update the shared Fastboard fixture to record controller `setTool` calls, then assert in `classroom-responsive-ui.cjs` that the initial selected pencil button has `aria-pressed="true"` and the first synchronized controller tool is `pencil`.

- [ ] **Step 3: Run the regression and verify it fails**

Run the existing responsive classroom integration command used by that fixture.

Expected: FAIL because the selected and applied initial tool is `selector`.

- [ ] **Step 4: Implement the minimal state change**

Change the `useState<ClassroomWhiteboardTool>` initializer in `classroom-v3.tsx` from `"selector"` to `"pencil"`. Do not add persistence or change any tool-selection effects.

- [ ] **Step 5: Run focused and full verification**

Run the responsive classroom integration test, `npm test`, and `npm run build`.

Expected: the regression passes, the full unit suite has zero failures, and the production build exits 0.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-whiteboard-default-pencil-design.md docs/superpowers/plans/2026-11-04-whiteboard-default-pencil.md src/components/classroom/classroom-v3.tsx tests/helpers/classroom-browser-fixture.cjs tests/integration/classroom-responsive-ui.cjs
git commit -m "fix: default classroom whiteboard to pencil"
```
