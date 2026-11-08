"use client";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { activityOverviewCopy } from "@/lib/classroom/activity-overview-copy";
import { useActivityDetail } from "@/lib/classroom/use-activity-detail";
import { activityAnswerText, type ActivityResponse } from "@/lib/classroom/activities";
import { MarkdownContent } from "@/components/markdown-content";
import { ActivityResults } from "./activity-results";
import { ActivitySolutions } from "./activity-chat-card";
import { ActivityChoiceOptions } from "./activity-choice-options";
import interaction from "./activity-interaction.module.css";
import styles from "./activity-overview.module.css";

export function ActivityHistoryDetail({ sessionId, activityId, shareAccess, canManage }: { sessionId: string; activityId: string; shareAccess?: string | null; canManage: boolean }) {
  const { locale } = useTranslation(), c = activityOverviewCopy(locale), { detail, reload, error } = useActivityDetail(sessionId, activityId, shareAccess);
  const [selected, setSelected] = useState("");
  if (!detail) return <div role="status" className={styles.detail}>{error ? <button onClick={() => void reload().catch(() => undefined)}>{c.retry}</button> : c.loading}</div>;
  const responses = canManage ? [...new Map<string, ActivityResponse>([...detail.responses, ...(detail.roster || []).flatMap(member => member.response ? [member.response] : [])].map(response => [response.id, response])).values()] : [];
  const response = canManage ? responses.find(response => response.id === selected) || null : detail.ownResponse;
  const reveal = canManage || (detail.resultsVisible ?? detail.status === "published");
  const referenceOnly = canManage && !response;
  return <div className={`${styles.detail} ${interaction.surface}`} data-activity-history={activityId}>
    {error && <p role="status">{c.failed} <button onClick={() => void reload().catch(() => undefined)}>{c.retry}</button></p>}
    {canManage && <label className={styles.responsePicker}>{c.selectResponse}<select aria-label={c.selectResponse} value={response?.id || ""} onChange={event => setSelected(event.target.value)}>
      <option value="">{c.reference} · {c.allResponses} {responses.length}</option>
      {responses.map(answer => <option key={answer.id} value={answer.id}>{answer.displayName} · {new Date(answer.submittedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</option>)}
    </select></label>}
    {!referenceOnly && reveal && detail.kind !== "poll" ? <>
      {detail.questionCount === 1 && <MarkdownContent content={detail.definition.questions[0].prompt} />}
      <ActivityResults detail={{ ...detail, ownResponse: response, resultsVisible: true }} />
    </> : <>
      {detail.definition.questions.map(question => <section className={styles.historyQuestion} key={question.id}>
        <MarkdownContent content={question.prompt} />
        {question.options.length ? <ActivityChoiceOptions question={question} response={response} reveal={referenceOnly && detail.kind !== "poll"} /> : <>
          {response && <MarkdownContent content={activityAnswerText(question, response.answers[question.id]) || c.noAnswer} />}
          {referenceOnly && question.correct?.length ? <MarkdownContent content={activityAnswerText(question, question.correct)} /> : null}
        </>}
      </section>)}
      {!response && !referenceOnly && <p>{c.noAnswer}</p>}
      {!reveal && <p className={styles.hint}>{c.waiting}</p>}
    </>}
    {reveal && <ActivitySolutions detail={detail} hideChoiceAnswers />}
    {response?.feedback && reveal && <p>{response.feedback}</p>}
  </div>;
}
