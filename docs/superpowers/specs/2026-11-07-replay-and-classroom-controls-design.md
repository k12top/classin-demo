# Replay and Classroom Controls Design

## Intent

Make two existing controls easier to find without redesigning their screens: place the replay speaker record directly below the utterance timeline, and place the in-class response launcher immediately to the right of the AI teacher launcher in the ClassIn layout.

## Scope

- Move the existing speaker list out of the lesson-summary body and render it after the timeline captions.
- Keep the same speaker data, counts, copy, colors, and responsive behavior.
- Offset the existing student activity reopen button only in the ClassIn layout so it sits to the right of the AI teacher launcher; preserve its current position in other layouts.
- Do not change data fetching, activity behavior, or the AI teacher interaction.

## Approach

Use the existing `LessonSummaryPanel` data to render a small speaker section after the timeline card, and remove the old summary sidebar. Use an ancestor-scoped CSS rule for the ClassIn layout to align the activity reopen button with the AI teacher cluster. This is smaller and safer than moving state between the activity and assistant components.

