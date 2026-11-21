# Activity Code Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve indentation in submitted classroom code and render code-like exercise options readably without corrupting ordinary text.

**Architecture:** Add a pure classifier/normalizer for conservative code detection, then a focused renderer that selects semantic code output or the existing Markdown renderer. Use the renderer only at activity answer and option boundaries.

**Tech Stack:** TypeScript, React 19, React server rendering tests, Next.js 16 CSS Modules.

**Spec:** `docs/superpowers/specs/2026-11-21-activity-code-rendering-design.md`

## Global Constraints

- Preserve ordinary Markdown and KaTeX behavior.
- Do not decode `\\n` inside an otherwise valid single-line code expression.
- Preserve the user's exact submitted whitespace when displaying code.

## Review Focus

- Python indentation must survive rendered markup.
- AI option text with literal line separators must become multiline only when code-like.
- `print("\\n")` must remain a single line.
- Prose containing punctuation or one code keyword must remain Markdown.
- Explicit fenced Markdown code must not receive a nested code block.

---

### Task 1: Code content classification

**Files:**
- Create: `src/lib/classroom/code-content.ts`
- Create: `tests/classroom-code-content.test.ts`

**Interfaces:**
- Produces: `classifyCodeContent(value: string, options?: { decodeEscapedNewlines?: boolean }): { code: boolean; content: string; language?: string }`

- [ ] Write table-driven failing tests for indented Python, escaped multiline options, `print("\\n")`, prose, and fenced code.
- [ ] Run `node --import tsx --test tests/classroom-code-content.test.ts` and verify the missing module/export failure.
- [ ] Implement the smallest classifier and conditional escaped-newline decoder that satisfies the cases.
- [ ] Run the focused test and verify it passes.

### Task 2: Activity code-aware rendering

**Files:**
- Create: `src/components/classroom/activity-text-content.tsx`
- Modify: `src/components/classroom/activity-choice-options.tsx`
- Modify: `src/components/classroom/activity-chat-card.tsx`
- Modify: `src/components/classroom/activity-interaction.module.css`
- Create: `tests/classroom-activity-text-content.test.tsx`

**Interfaces:**
- Consumes: `classifyCodeContent`
- Produces: `ActivityTextContent({ content, decodeEscapedNewlines?, className? })`

- [ ] Write failing server-render tests proving semantic code markup, preserved indentation, safe option decoding, and unchanged prose Markdown.
- [ ] Run `node --import tsx --test tests/classroom-activity-text-content.test.tsx` and verify the missing component failure.
- [ ] Implement the renderer and replace activity option and written-answer display call sites.
- [ ] Add scoped code-surface styles in the existing activity CSS Module.
- [ ] Run focused tests, then the full suite and lint.
