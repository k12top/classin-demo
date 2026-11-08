import { ActivityError, type ActivityDefinition, type ActivityKind, type ActivityQuestion, type QuestionKind } from "./activities";

export type ActivityDraft = { title: string; kind: ActivityKind; durationSec: number | null; definition: ActivityDefinition };

export function assertDraftSelection(draft: ActivityDraft, kind: ActivityKind, type: QuestionKind) {
  const questions = draft.definition.questions;
  if (draft.kind !== kind || questions.length !== 1 || questions[0].type !== type) throw new ActivityError("AI draft did not match the requested question type", 502);
  // A true/false question relabelled as multiple-choice is not a multiple-choice
  // exercise. Require genuine alternatives and multiple correct answers for AI.
  if (kind === "quiz" && type === "multiple" && (questions[0].options.length < 3 || (questions[0].correct?.length ?? 0) < 2)) throw new ActivityError("AI multiple-choice draft needs at least three options and two correct answers", 502);
}

export function removeActivityOption(question: ActivityQuestion, optionId: string): ActivityQuestion {
  if (question.type === "boolean" || question.options.length <= 2) return question;
  return { ...question, options: question.options.filter(option => option.id !== optionId), correct: question.correct?.filter(id => id !== optionId) };
}
