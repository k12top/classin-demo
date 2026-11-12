# Live Summary Long Formula Labels

## Intent

Make long LaTeX question labels in the ended-class accuracy chart easier to read without turning the chart into an unbounded, low-density list.

## Goals

- Show each chart label on at most two lines, using the existing Markdown/KaTeX renderer.
- Increase each question row from 42px to approximately 56px so two lines do not collide with neighboring bars.
- Expose the complete rendered question from mouse hover and keyboard focus.
- Preserve sorting, pagination, bar selection, and the complete accessible data table.

## Non-goals and constraints

- Do not change question data, grading, chart calculations, or pagination size.
- Do not add a second math library or render untrusted HTML.
- Do not allow labels to grow the chart without a bound.

## Approaches

1. **Two-line clamp plus full-content popover (selected):** preserves chart density while making common formulas readable and keeping the complete question one interaction away.
2. Fully variable row height: never truncates, but produces unstable chart height and complicates ECharts row alignment.
3. Horizontal scrolling: small implementation, but poor reading and keyboard ergonomics.

## Design

The React/KaTeX label overlay remains aligned with the ECharts grid. Each label receives a fixed 56px row, clamps to two lines, and becomes a focusable trigger only when complete content may be needed. Hover and focus reveal a positioned popover containing the same `MarkdownContent` rendering without clamping. Narrow viewports keep the popover within the chart boundary. Existing chart clicks pass through outside the label trigger, and the expanded data table remains the canonical complete tabular representation.
