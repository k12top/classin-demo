"use client";
import { Check, Clock3, Minus, X } from "lucide-react";
import { activityAnswerText, activityQuestionJudgment, type ActivityDetail } from "@/lib/classroom/activities";
import { interactionCopy } from "@/lib/classroom/interaction-copy";
import { useTranslation } from "@/lib/i18n/context";
import { MarkdownContent } from "@/components/markdown-content";
import styles from "./activity-interaction.module.css";

/** Published feedback only; active/closed snapshots must never reveal an answer key. */
export function ActivityResults({ detail }: { detail: ActivityDetail }) {
  const { locale } = useTranslation(), copy = interactionCopy(locale);
  if (!(detail.resultsVisible ?? detail.status === "published") || detail.kind === "poll") return null;
  return <div className={styles.results} role="status" aria-label={copy.resultsPublished}>
    {detail.definition.questions.map(question => {
      const judgment = activityQuestionJudgment(question, detail.ownResponse);
      const label = judgment === "pending" ? copy.pendingGrade : copy[judgment];
      const Icon = judgment === "correct" ? Check : judgment === "incorrect" ? X : judgment === "pending" ? Clock3 : Minus;
      const score = detail.ownResponse?.grading?.[question.id];
      return <section key={question.id} className={styles.resultItem} data-judgment={judgment}>
        <strong><Icon aria-hidden="true" />{label}</strong>
        {detail.questionCount > 1 && <MarkdownContent content={question.prompt}/>}
        <div><span>{copy.yourAnswer}：</span><MarkdownContent content={activityAnswerText(question, detail.ownResponse?.answers[question.id]) || copy.unanswered}/></div>
        {!!question.correct?.length && <div><span>{copy.correctAnswer}：</span><MarkdownContent content={activityAnswerText(question, question.correct)}/></div>}
        {typeof score === "number" && <p><span>{copy.score}：</span>{score} / {question.points}</p>}
        {detail.ownResponse?.aiReview?.[question.id]?.reason && <p>{detail.ownResponse.aiReview[question.id].reason}</p>}
      </section>;
    })}
  </div>;
}
