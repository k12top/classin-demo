"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { useTimeZone } from "@/lib/use-time-zone";
import { replayPreviewActivityUrl } from "@/lib/classroom/use-activity-detail";
import { activityDisplayTime } from "@/lib/classroom/activity-display-time";
import { activityOverviewCopy } from "@/lib/classroom/activity-overview-copy";
import type { ActivityOverview } from "@/lib/classroom/activity-overview";
import { ClassroomSyncBoundary, useActivityVersionWatch, useClassroomJsonRead, useClassroomSyncTask } from "@/lib/classroom/use-classroom-sync";
import { ActivityHistoryDetail } from "./activity-history-detail";
import { MarkdownContent } from "@/components/markdown-content";
import { ActivityOverviewCharts } from "./activity-overview-charts";
import type { QuestionChartRow } from "@/lib/classroom/activity-chart-model";
import styles from "./activity-overview.module.css";

type ActivityDashboardProps = { sessionId: string; shareAccess?: string | null; review?: boolean; previewStudentId?: string | null; canSeekActivity?: (startedAt:string)=>boolean; onSeekActivity?: (startedAt:string,id:string)=>void };
export function ActivityDashboard(props: ActivityDashboardProps) {
  return <ClassroomSyncBoundary sessionId={props.sessionId}><ActivityDashboardSession key={`${props.sessionId}:${props.shareAccess || ""}:${props.previewStudentId || ""}`} {...props} /></ClassroomSyncBoundary>;
}
function ActivityDashboardSession({ sessionId, shareAccess, review = false, previewStudentId, canSeekActivity, onSeekActivity }: ActivityDashboardProps) {
  const { locale, t } = useTranslation(), c = activityOverviewCopy(locale), read = useClassroomJsonRead(sessionId);
  const {timeZone}=useTimeZone();
  const [data, setData] = useState<ActivityOverview | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"activities" | "students">("activities"), [search, setSearch] = useState(""), [selected, setSelected] = useState<string | undefined>();
  const generation = useRef(0);
  const history = useRef<HTMLDivElement>(null), pendingFocus = useRef<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useActivityVersionWatch(sessionId, shareAccess);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current; setBusy(true);
    const params = new URLSearchParams({ overview: "1" }); if (shareAccess) params.set("shareAccess", shareAccess);
    try { const value = await read<ActivityOverview>(previewStudentId?replayPreviewActivityUrl(sessionId,previewStudentId):`/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities?${params}`, { signal }); if (!signal?.aborted && current === generation.current) { setData(value); setError(false); } }
    catch (failure) { if (!signal?.aborted && current === generation.current) { const status=(failure as {status?:number})?.status; if(status===401||status===403||status===404){setData(null);setSelected(undefined);setSearch("");} setError(true); } throw failure; }
    finally { if (current === generation.current) setBusy(false); }
  }, [sessionId, shareAccess, read, previewStudentId]);
  const taskKey = `activity-overview:${shareAccess || ""}:${previewStudentId || ""}`;
  const sync = useClassroomSyncTask({ sessionId, taskKey, topics: ["activities", "resume", taskKey], realtimeMs: review ? 30000 : 60000, fallbackMs: review ? 30000 : 5000, maxRetryMs: 8000, run: reload });
  const refresh = () => sync.scheduler.refresh(taskKey);
  useEffect(() => () => { generation.current++; }, [reload]);
  const percent = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
  const activeId = selected ?? data?.activities.find(activity => activity.status === "active")?.id;
  const current = data?.activities.find(activity => activity.status === "active");
  const selectQuestion = (row: Pick<QuestionChartRow, "activityId">) => { pendingFocus.current = row.activityId; setTab("activities"); setSelected(row.activityId); setFocusRequest(value => value + 1); };
  useEffect(() => {
    if (!pendingFocus.current || activeId !== pendingFocus.current || tab !== "activities") return;
    const index = data?.activities.findIndex(activity => activity.id === activeId) ?? -1;
    const button = index < 0 ? null : history.current?.children[index]?.querySelector<HTMLButtonElement>("button");
    button?.focus({ preventScroll: true }); button?.scrollIntoView({ behavior: "instant", block: "nearest" }); pendingFocus.current = null;
  }, [activeId, tab, data, focusRequest]);
  const students = (data?.students || []).filter(student => student.displayName.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  return <section className={`${styles.panel} ${review ? styles.review : ""}`} data-activity-dashboard aria-label={review ? c.history : c.dashboard}>
    <header className={styles.header}><h3><BarChart3 aria-hidden="true" />{review ? data && !data.canManage ? c.mine : c.history : c.dashboard}</h3><button type="button" onClick={refresh} disabled={busy} aria-label={c.refresh}><RefreshCw aria-hidden="true" /></button></header>
    {error && <p className={styles.error} role="status">{data ? c.failed : c.failedInitial} <button onClick={refresh} disabled={busy}>{c.retry}</button></p>}
    {!data ? !error && <p role="status">{c.loading}</p> : <>
      <p className={styles.hint}>{data.canManage ? c.teacherHint : c.studentHint}</p>
      <dl className={styles.metrics} aria-label={c.overview}>
        <div><dt>{c.activities} / {c.questions}</dt><dd>{data.activityCount} / {data.questionCount}</dd></div>
        <div><dt>{c.participation}</dt><dd>{percent(data.participation)}</dd></div>
        <div><dt>{c.accuracy}</dt><dd>{percent(data.accuracy)}</dd></div>
        <div><dt>{data.canManage ? c.pending : c.withheld}</dt><dd>{data.canManage ? data.quality.pending : data.quality.withheld}</dd></div>
      </dl>
      <div className={styles.metricContext}>{data.canManage && <span>{c.students} {data.studentCount} · {c.submissions} {data.submissions}</span>}<details><summary>{c.metricNotes}</summary><p>{data.canManage ? c.metricsHint : c.mineMetricsHint}</p></details></div>
      {data.live && current && <div className={styles.currentFocus}><div><span>{c.current}</span><strong>{current.title}</strong><small>{data.canManage ? `${c.responseCount} ${current.responseCount} / ${data.studentCount}` : current.responseCount ? c.answered : c.noAnswer}</small></div><button type="button" onClick={() => selectQuestion({ activityId: current.id })}>{c.viewResponses}</button></div>}
      {data.canManage && <div className={styles.tabs} role="group" aria-label={c.scope}><button type="button" aria-pressed={tab === "activities"} onClick={() => setTab("activities")}>{c.byActivity}</button><button type="button" aria-pressed={tab === "students"} onClick={() => setTab("students")}>{c.byStudent}</button></div>}
      {(!data.canManage || tab === "activities") && <ActivityOverviewCharts data={data} onSelect={selectQuestion} />}
      {data.canManage && tab === "students" ? <>
        <input className={styles.search} aria-label={c.search} placeholder={c.search} value={search} onChange={event => setSearch(event.target.value)} />
        <div className={styles.tableScroll}><table><caption className="sr-only">{c.quality}</caption><thead><tr><th scope="col">{c.student}</th><th scope="col">{c.participation}</th><th scope="col">{c.correct} / {c.graded}</th><th scope="col">{c.accuracy}</th><th scope="col">{c.score}</th><th scope="col">{c.pending}</th></tr></thead><tbody>{students.map(student => <tr key={student.userId}><th scope="row">{student.displayName}</th><td>{student.submissions} / {data.activityCount}</td><td>{student.quality.correct} / {student.quality.correct + student.quality.incorrect + student.quality.partial}</td><td>{percent(student.accuracy)}</td><td>{student.quality.gradedPoints ? `${student.quality.earnedPoints} / ${student.quality.gradedPoints}` : "—"}</td><td>{student.quality.pending}</td></tr>)}</tbody></table></div>
        {!students.length && <p className={styles.hint}>{c.noStudents}</p>}
      </> : <div className={styles.history} ref={history}>
        {!data.activities.length && <p className={styles.hint}>{c.empty}</p>}
        {data.activities.map(activity => <article className={styles.activity} key={activity.id}>
          <button type="button" className={styles.activityButton} aria-expanded={activeId === activity.id} onClick={() => setSelected(activeId === activity.id ? "" : activity.id)}>
            <span className={styles.activityTitle}>{activity.title}<small>{t(`activities.${activity.kind}`)} · {t(`activities.${activity.status}`)}{activity.startedAt && <> · <time dateTime={activity.startedAt} title={timeZone}>{activityDisplayTime(activity.startedAt,locale,timeZone)}</time></>}</small></span><ChevronDown aria-hidden="true" />
          </button>
          <div className={styles.activityNumbers}>{activity.status === "cancelled" ? <span>{c.cancelled}</span> : <><span>{data.canManage ? c.responseCount : activity.responseCount ? c.answered : c.noAnswer}{data.canManage && <> {activity.responseCount} / {data.studentCount}</>}</span><span>{c.accuracy} {percent(activity.accuracy)}</span>{activity.quality.pending > 0 && <span>{c.pending} {activity.quality.pending}</span>}{activity.quality.withheld > 0 && <span>{c.withheld}</span>}</>}</div>
          {review&&onSeekActivity&&activity.startedAt&&<button type="button" className={styles.seekActivity} disabled={!canSeekActivity?.(activity.startedAt)} title={!canSeekActivity?.(activity.startedAt)?c.noPlayableRecording:undefined} onClick={()=>onSeekActivity(activity.startedAt!,activity.id)}>{c.jumpRecording}</button>}
          {activeId === activity.id && <>
            {activity.questionCount > 1 && <ol className={styles.questionStats}>{activity.questions.map(question => <li key={question.id}><MarkdownContent content={question.prompt} /><span>{c.accuracy} {percent(question.accuracy)} · {c.graded} {question.quality.correct + question.quality.incorrect + question.quality.partial}{question.quality.pending > 0 && <> · {c.pending} {question.quality.pending}</>}</span></li>)}</ol>}
            <ActivityHistoryDetail key={activity.id} sessionId={sessionId} activityId={activity.id} shareAccess={shareAccess} canManage={data.canManage} previewStudentId={previewStudentId} />
          </>}
        </article>)}
      </div>}
      {!review && <a className={styles.reviewLink} target="_blank" rel="noopener noreferrer" href={`/sessions/${encodeURIComponent(sessionId)}/activities${shareAccess ? `?shareAccess=${encodeURIComponent(shareAccess)}` : ""}`}>{c.reviewLink}</a>}
    </>}
  </section>;
}
