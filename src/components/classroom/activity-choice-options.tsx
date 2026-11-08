"use client";
import { useId } from "react";
import { Check, X } from "lucide-react";
import { activityQuestionJudgment, type ActivityAnswers, type ActivityQuestion, type ActivityResponse } from "@/lib/classroom/activities";
import { interactionCopy } from "@/lib/classroom/interaction-copy";
import { useTranslation } from "@/lib/i18n/context";
import { MarkdownContent } from "@/components/markdown-content";
import styles from "./activity-interaction.module.css";

/** The saved selection and its feedback share one row, in forms and chat. */
export function ActivityChoiceOptions({ question, answer, response = null, reveal = false, disabled = true, onChange }: {
  question: ActivityQuestion; answer?: ActivityAnswers[string]; response?: ActivityResponse | null;
  reveal?: boolean; disabled?: boolean; onChange?: (answer: string[]) => void;
}) {
  const { locale } = useTranslation(), c = interactionCopy(locale), name = useId();
  const value = answer ?? response?.answers[question.id];
  const selected = Array.isArray(value) ? value : [];
  const judgment = activityQuestionJudgment(question, response);
  const score = response?.grading?.[question.id];
  const hasKey = reveal && Boolean(question.correct?.length);
  return <div className={styles.answerOptions} data-choice-options data-judgment={reveal ? judgment : undefined}>
    {reveal && <div className={styles.choiceMeta} role="status" aria-label={c.resultsPublished}>
      <span>{judgment === "unanswered" ? c.unanswered : judgment === "pending" ? c.pendingGrade : <span className="sr-only">{c[judgment]}</span>}</span>
      {typeof score === "number" && <span aria-label={c.score}>{score} / {question.points}</span>}
    </div>}
    {question.options.map((option, index) => {
      const checked = selected.includes(option.id), correct = hasKey && question.correct!.includes(option.id);
      const incorrect = hasKey && checked && !correct;
      const missed = correct && !checked && question.type === "multiple" && Boolean(response);
      return <label key={option.id} className={styles.answerOption} data-result={correct ? "correct" : incorrect ? "incorrect" : undefined}>
        <input type={question.type === "multiple" ? "checkbox" : "radio"} name={name} value={option.id} checked={checked} disabled={disabled}
          required={Boolean(onChange) && question.type !== "multiple"} onChange={event => onChange?.(question.type === "multiple" ? event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id) : [option.id])} />
        <span>{String.fromCharCode(65 + index)}</span><MarkdownContent className={styles.answerOptionText} content={option.text} />
        {missed && <small className={styles.missedOption}>{c.missedOption}</small>}
        {correct ? <Check aria-label={c.correctAnswer} /> : incorrect ? <X aria-label={c.incorrect} /> : null}
      </label>;
    })}
  </div>;
}
