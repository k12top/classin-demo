"use client";

import { ActivityDraftControls } from "./activity-draft-controls";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BarChart3, Check, ClipboardList, Download, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { useClassroomSyncTask, useClassroomJsonRead } from "@/lib/classroom/use-classroom-sync";
import { ACTIVITY_REFRESH_EVENT, answersMatch } from "@/lib/classroom/activities";
import type { ActivityAnswers, ActivityDefinition, ActivityDetail, ActivityGrade, ActivityKind, ActivityList, ActivityPresentation, ActivityQuestion, ActivityResponse, QuestionKind } from "@/lib/classroom/activities";
import styles from "./activity-workspace.module.css";

type Props = { sessionId: string; shareAccess?: string | null; review?: boolean; onChanged?: (revision: number) => void };
function endpoint(sessionId: string, id?: string) { return `/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities${id ? `/${encodeURIComponent(id)}` : ""}`; }
function query(url: string, shareAccess?: string | null, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra);
  if (shareAccess) params.set("shareAccess", shareAccess);
  return url + (params.size ? `?${params}` : "");
}

function activityErrorText(message: string, t: (key: string) => string) {
  const keys: Record<string, string> = {
    "Grade all written answers before publishing results": "ungraded",
    "Activity is closed; your last saved answer is retained": "closed",
    "Close the current activity first": "active",
    "This draft has changed. Refresh before saving": "draftChanged",
    "This grade has changed. Refresh before saving": "gradeChanged",
    "This answer has changed. Load the saved answer before submitting": "answerChanged",
    "Request timed out. Refresh before retrying": "timeout",
    "Start the lesson before publishing a draft": "startLesson",
    "Only authorized teachers can manage activities": "forbidden",
    "Only authorized teachers can create activities": "forbidden",
    "Only authorized teachers can export responses": "forbidden",
    "This lesson has ended. Open another lesson to prepare activities": "ended",
    "Select a valid answer for every question": "answer",
    "Invalid or empty text": "text",
    "Set a correct answer": "correct",
    "Correct answer is not an option": "correct",
    "Select one correct answer": "oneCorrect",
    "Invalid points": "points",
    "Grade every question within its point limit": "points",
    "Use two to eight options": "options",
    "Duration must be 10 seconds to 24 hours": "duration",
    "Join the classroom to answer": "join",
    "Unauthorized": "login",
  };
  return keys[message] ? t(`activities.errors.${keys[message]}`) : message;
}

/** Small, always-visible discovery control; private answers stay in the drawer. */
export function ActivityNotice({ sessionId, shareAccess, onOpen }: Props & { onOpen: () => void }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<ActivityList["active"]>(null);
  const read=useClassroomJsonRead(sessionId);
  useClassroomSyncTask({sessionId,taskKey:`activity-notice:${shareAccess||""}`,topics:["activities","resume"],wakeAt:active?.deadlineAt?Date.parse(active.deadlineAt):undefined,run:async signal=>{
    const data=await read<ActivityList>(query(endpoint(sessionId),shareAccess),{signal});setActive(data.active);
  }});
  return <button type="button" className={`${styles.notice} ${active ? styles.open : ""}`} onClick={onOpen}
    title={active ? t("activities.current", { title: active.title }) : t("activities.title")} aria-live="polite">
    <ClipboardList /><span>{active ? t(`activities.${active.kind}`) : t("activities.title")}</span>{active && <strong>{t("activities.active")}</strong>}
  </button>;
}

export function ActivityWorkspace(props: Props) {
  return <ActivityWorkspaceSession key={`${props.sessionId}:${props.shareAccess || ""}`} {...props} />;
}
export type AnswerDraft = { answers: ActivityAnswers; expectedVersion: number };
function ActivityWorkspaceSession({ sessionId, shareAccess, review = false, onChanged }: Props) {
  const { t } = useTranslation();
  const read=useClassroomJsonRead(sessionId);
  const [list, setList] = useState<ActivityList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [editing, setEditing] = useState<"new" | ActivityDetail | null>(null);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const mutation = useRef(false);
  const requestId = useRef<{ payload: string; id: string } | null>(null);
  const listPages = useRef(1);
  const responsePages = useRef(1);
  const [answerDrafts, setAnswerDrafts] = useState(() => new Map<string, AnswerDraft>());
  const invalidate = useCallback(() => { generation.current++; }, []);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const request = ++generation.current;
    try {
      const [data, nextDetail] = await Promise.all([read<ActivityList>(query(endpoint(sessionId), shareAccess),{signal}), selected ? read<ActivityDetail>(query(endpoint(sessionId, selected), shareAccess),{signal}) : Promise.resolve(null)]);
      for (let page = 1; page < listPages.current && data.nextCursor; page++) {
        const more = await read<ActivityList>(query(endpoint(sessionId), shareAccess, { cursor: data.nextCursor }),{signal});
        data.activities.push(...more.activities); data.nextCursor = more.nextCursor;
      }
      if (nextDetail) for (let page = 1; page < responsePages.current && nextDetail.responseCursor; page++) {
        const more = await read<ActivityDetail>(query(endpoint(sessionId, selected!), shareAccess, { cursor: nextDetail.responseCursor }),{signal});
        nextDetail.responses.push(...more.responses); nextDetail.responseCursor = more.responseCursor;
      }
      if (signal?.aborted || request !== generation.current) return;
      setList(data); setDetail(nextDetail); setRefreshError("");
      return { data, nextDetail };
    } catch (e) { if (request === generation.current) setRefreshError(e instanceof Error ? e.message : t("activities.failed")); }
  }, [sessionId, shareAccess, selected, t, read]);
  useClassroomSyncTask({sessionId,taskKey:`activity-workspace:${selected||""}:${shareAccess||""}`,topics:["activities","resume"],wakeAt:list?.active?.deadlineAt?Date.parse(list.active.deadlineAt):undefined,run:async signal=>{if(!mutation.current&&!await reload(signal))throw new Error("activities_unavailable");}});
  useEffect(()=>()=>invalidate(),[invalidate,reload]);
  const announce = (revision: number) => { window.dispatchEvent(new CustomEvent(ACTIVITY_REFRESH_EVENT, { detail: { sessionId } })); onChanged?.(revision); };
  const command = async (body: Record<string, unknown>, id = selected) => {
    if (!id || mutation.current) return false;
    mutation.current = true; generation.current++; setBusy(true); setError(""); setNotice("");
    try {
      const result = await read<{ revision: number; response?: ActivityResponse }>(query(endpoint(sessionId, id), shareAccess), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, shareAccess }) });
      if (result.response) setDetail(old => old?.id === id ? { ...old, ownResponse: result.response! } : old);
      announce(result.revision); setNotice(t("activities.saveSuccess")); await reload(); return true;
    } catch (e) {
      const refreshed = await reload();
      // A lost HTTP response can follow a durable save. Confirm the exact
      // retained answer with an authoritative read before clearing local edits.
      const saved = refreshed?.nextDetail?.ownResponse;
      if (body.action === "answer" && saved && answersMatch(body.answers as ActivityAnswers, saved.answers)) { setNotice(t("activities.saveSuccess")); return true; }
      setError(e instanceof Error ? e.message : t("activities.failed")); return false;
    }
    finally { mutation.current = false; setBusy(false); }
  };
  const save = async (activity: Record<string, unknown>) => {
    if (editing && editing !== "new") { const ok = await command({ action: "edit", activity, expectedVersion: editing.version }, editing.id); if (ok) setEditing(null); return; }
    if (mutation.current) return;
    const payload = JSON.stringify(activity);
    if (requestId.current?.payload !== payload) requestId.current = { payload, id: crypto.randomUUID() };
    mutation.current = true; generation.current++; setBusy(true); setError("");
    try {
      const result = await read<{ id: string; revision: number }>(endpoint(sessionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activity, requestId: requestId.current.id, shareAccess }) });
      announce(result.revision); requestId.current = null; setEditing(null); setNotice(t("activities.saveSuccess")); await reload(); responsePages.current = 1; setSelected(result.id); setDetail(null);
    } catch (e) { setError(e instanceof Error ? e.message : t("activities.failed")); }
    finally { mutation.current = false; setBusy(false); }
  };
  const exportCsv = async () => {
    if (!selected || mutation.current) return;
    mutation.current = true; setBusy(true); setError("");
    try {
      const res = await fetch(query(endpoint(sessionId, selected), shareAccess, { export: "csv" }), { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error((await res.json()).error || t("activities.failed"));
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "activity-results.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? (e.name === "TimeoutError" ? "Request timed out. Refresh before retrying" : e.message) : t("activities.failed")); }
    finally { mutation.current = false; setBusy(false); }
  };
  const more = async (responses = false) => {
    if (mutation.current) return;
    const cursor = responses ? detail?.responseCursor : list?.nextCursor;
    if (!cursor) return;
    mutation.current = true; generation.current++; setBusy(true);
    try {
      if (responses && selected) {
        const data = await read<ActivityDetail>(query(endpoint(sessionId, selected), shareAccess, { cursor }));
        responsePages.current++;
        setDetail(old => old ? { ...data, responses: [...old.responses, ...data.responses] } : data);
      } else {
        const data = await read<ActivityList>(query(endpoint(sessionId), shareAccess, { cursor }));
        listPages.current++;
        setList(old => old ? { ...data, activities: [...old.activities, ...data.activities] } : data);
      }
    } catch (e) { setError(e instanceof Error ? e.message : t("activities.failed")); }
    finally { mutation.current = false; setBusy(false); }
  };
  const loadLatestDraft = async () => {
    if (mutation.current || !editing || editing === "new") return;
    mutation.current = true; generation.current++; setBusy(true);
    try {
      const latest = await read<ActivityDetail>(query(endpoint(sessionId, editing.id), shareAccess));
      if (latest.status !== "draft") { setEditing(null); await reload(); }
      else setEditing(latest);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : t("activities.failed")); }
    finally { mutation.current = false; setBusy(false); }
  };
  return <section className={styles.workspace} data-activity-workspace>
    <header className={styles.header}><h2><ClipboardList />{t(review ? "activities.review" : "activities.title")}</h2>
      <button type="button" onClick={() => void reload()} disabled={busy} aria-label={t("activities.refresh")}><RefreshCw /></button></header>
    {error && <div className={styles.error} role="alert"><p>{activityErrorText(error, t)}</p><button type="button" onClick={() => {
      if (error === "This draft has changed. Refresh before saving" && editing && editing !== "new") {
        void loadLatestDraft();
      } else { setError(""); void reload(); }
    }} disabled={busy}>{t(error === "This draft has changed. Refresh before saving" ? "activities.loadLatestDraft" : "activities.refresh")}</button></div>}
    {refreshError && <div className={styles.error} role="alert"><p>{list ? t("activities.loadFailure") : t("activities.failed")} {activityErrorText(refreshError, t)}</p><button type="button" onClick={() => void reload()} disabled={busy}>{t("activities.retry")}</button></div>}
    {notice && <p className={styles.noticeText} role="status"><Check />{notice}</p>}
    {!list ? <p className={styles.muted}><Loader2 className={styles.spinner} />{t("activities.loading")}</p> : editing && list.canManage ?
      <ActivityEditor sessionId={sessionId} shareAccess={shareAccess} key={editing === "new" ? "new" : `${editing.id}:${editing.version}`} initial={editing === "new" ? undefined : editing} busy={busy} onSave={save} onCancel={() => setEditing(null)} /> : <>
      {list.canManage && list.canPrepare && <div className={styles.prepare}><p>{t("activities.prepare")}</p><button type="button" className={styles.primary} onClick={() => setEditing("new")} disabled={busy}><Plus />{t("activities.new")}</button></div>}
      {(list.activities.length > 0 || list.active) ? <nav className={styles.list} aria-label={t("activities.select")}>
        {(list.active && !list.activities.some(a => a.id === list.active!.id) ? [list.active, ...list.activities] : list.activities).map(activity => <button key={activity.id} type="button" aria-pressed={selected === activity.id}
          disabled={busy} onClick={() => { if (mutation.current) return; responsePages.current = 1; generation.current++; setSelected(activity.id); setDetail(null); setNotice(""); }}><span><strong>{activity.title}</strong><small>{t(`activities.${activity.kind}`)} · {t("activities.questionCount", { count: activity.questionCount })}</small></span><span className={activity.status === "active" ? styles.activeTag : styles.tag}>{t(`activities.${activity.status}`)}</span></button>)}
      </nav> : <p className={styles.empty}>{t("activities.empty")}</p>}
      {list.nextCursor && <button type="button" disabled={busy} onClick={() => void more()}>{t("activities.loadMore")}</button>}
      {selected && !detail && <p className={styles.muted}>{t("activities.loading")}</p>}
      {detail && detail.id === selected && <div className={styles.detail}>
        <header><h3>{detail.title}</h3><p>{t("activities.responses", { count: detail.responseCount })} · {t(`activities.${detail.status}`)}</p><ActivityDeadline deadline={detail.deadlineAt} active={detail.status === "active"} /></header>
        {list.canManage ? <>
          <div className={styles.actions}>
            {detail.status === "draft" && <><button type="button" disabled={busy} onClick={() => setEditing(detail)}>{t("activities.editDraft")}</button><button type="button" className={styles.primary} disabled={busy || !list.live || !!list.active} onClick={() => void command({ action: "start" })}>{t("activities.start")}</button></>}
            {detail.status === "active" && <button type="button" disabled={busy} onClick={() => window.confirm(t("activities.closeConfirm")) && void command({ action: "close" })}>{t("activities.stop")}</button>}
            {detail.status === "closed" && <button type="button" className={styles.primary} disabled={busy} onClick={() => window.confirm(t("activities.confirmPublish")) && void command({ action: "publish" })}>{t("activities.publish")}</button>}
            {["draft", "active", "closed"].includes(detail.status) && <button type="button" disabled={busy} onClick={() => window.confirm(t("activities.confirmCancel")) && void command({ action: "cancel" })}>{t("activities.cancelActivity")}</button>}
            <button type="button" disabled={busy} onClick={() => void exportCsv()}><Download />{t("activities.export")}</button>
          </div>
          {list.live && ["active", "closed", "published"].includes(detail.status) && <div className={styles.presentationControls}>
            <label>{t("activities.presentQuestion")}<select value={detail.presentedQuestion} disabled={busy} onChange={e => void command({ action: "present", index: Number(e.target.value) })}>{detail.definition.questions.map((q, index) => <option key={q.id} value={index}>{index + 1}. {q.prompt.slice(0, 60)}</option>)}</select></label>
            <button type="button" disabled={busy} onClick={() => void command(detail.presented ? { action: "hide" } : { action: "present", index: detail.presentedQuestion })}>{t(detail.presented ? "activities.hideStage" : "activities.showStage")}</button>
          </div>}
          <QuestionPreview definition={detail.definition} />
          {detail.statistics && <ActivityStatistics detail={detail} />}
          <h4>{t("activities.teacherAnswers")}</h4>
          {!detail.responses.length && <p className={styles.muted}>{t("activities.noResponses")}</p>}
          {detail.responses.map(r => <ResponseGrader key={r.id} response={r} definition={detail.definition} canGrade={detail.status === "closed" && detail.kind !== "poll"} busy={busy} onSave={(grading, feedback, expectedVersion) => command({ action: "grade", responseId: r.id, grading, feedback, expectedVersion })} />)}
          {detail.responseCursor && <button type="button" disabled={busy} onClick={() => void more(true)}>{t("activities.loadMore")}</button>}
        </> : <>
          {list.canAnswer && (detail.status === "active" || answerDrafts.has(detail.id)) ? <>
            <AnswerForm key={detail.id} detail={detail} busy={busy} enabled={list.live && detail.status === "active"}
              draft={answerDrafts.get(detail.id)} onDraft={draft => setAnswerDrafts(old => { const next = new Map(old); if (draft) next.set(detail.id, draft); else next.delete(detail.id); return next; })}
              onSubmit={(answers, expectedVersion) => command({ action: "answer", answers, expectedVersion })} />
            {detail.status !== "active" && detail.ownResponse && <SavedResponse response={detail.ownResponse} definition={detail.definition} />}
            {detail.status === "published" && <QuestionPreview definition={detail.definition} />}
          </> : <>
            <QuestionPreview definition={detail.definition} />
            {detail.ownResponse ? <SavedResponse response={detail.ownResponse} definition={detail.definition} /> : <p className={styles.muted}>{t("activities.notSubmitted")}</p>}
          </>}
          {detail.status === "closed" && <p className={styles.muted}>{t("activities.waiting")}</p>}
          {detail.status === "published" && detail.statistics && <ActivityStatistics detail={detail} />}
        </>}
      </div>}
    </>}
    {!review && <a className={styles.reviewLink} href={query(`/sessions/${encodeURIComponent(sessionId)}/activities`, shareAccess)} target="_blank" rel="noopener noreferrer">{t("activities.afterClass")}</a>}
  </section>;
}

function ActivityDeadline({ deadline, active }: { deadline: string | null; active: boolean }) {
  const { t } = useTranslation(); const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active || !deadline) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active, deadline]);
  if (!active || !deadline) return null;
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  return <p className={seconds < 30 ? styles.urgent : styles.muted}>{seconds ? t("activities.remaining", { seconds }) : t("activities.ended")}</p>;
}
function newQuestion(type: QuestionKind = "single"): ActivityQuestion { return { id: crypto.randomUUID(), type, prompt: "", points: 10, options: type === "single" || type === "multiple" || type === "boolean" ? [{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }] : [], correct: [] }; }
function ActivityEditor({ initial, busy, onSave, onCancel, sessionId, shareAccess }: { sessionId:string; shareAccess?:string|null; initial?: ActivityDetail; busy: boolean; onSave: (data: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation(); const [kind, setKind] = useState<ActivityKind>(initial?.kind || "poll");
  const [title, setTitle] = useState(initial?.title || ""); const [duration, setDuration] = useState(initial?.durationSec ? String(initial.durationSec / 60) : "");
  const [questions, setQuestions] = useState<ActivityQuestion[]>(initial?.definition.questions || [newQuestion()]);
  const update = (index: number, value: Partial<ActivityQuestion>) => setQuestions(old => old.map((q, i) => i === index ? { ...q, ...value } : q));
  function submit(event: FormEvent) { event.preventDefault(); void onSave({ title, kind, durationSec: duration ? Math.round(Number(duration) * 60) : null, definition: { questions: questions.map(q => ({ ...q, correct: q.correct?.filter(c => c.trim()) })) } }); }
  return <form className={styles.editor} onSubmit={submit}>
    <button type="button" onClick={onCancel} disabled={busy}><ArrowLeft />{t("activities.cancel")}</button>
    <label>{t("activities.name")}<input autoFocus value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} disabled={busy} /></label>
    <label>{t("activities.title")}<select value={kind} disabled={busy || !!initial} onChange={e => { const v = e.target.value as ActivityKind; setKind(v); setQuestions([newQuestion(v === "task" ? "essay" : "single")]); }}>{["poll", "quiz", "task"].map(k => <option key={k} value={k}>{t(`activities.${k}`)}</option>)}</select></label>
    <label>{t("activities.duration")}<input type="number" min={1 / 6} max={1440} step="any" placeholder={t("activities.unlimited")} value={duration} onChange={e => setDuration(e.target.value)} disabled={busy} /></label>
    <ActivityDraftControls sessionId={sessionId} shareAccess={shareAccess} source={{title,kind,definition:{questions}}} kind={kind} type={questions[0]?.type||"single"} onApply={draft=>{setTitle(draft.title);setKind(draft.kind);setQuestions(draft.definition.questions)}} />
    {questions.map((q, index) => <fieldset key={q.id} disabled={busy} className={styles.question}>
      <legend>{t("activities.question", { number: index + 1 })}</legend>
      {kind === "quiz" && <select aria-label={t("activities.question", { number: index + 1 })} value={q.type} onChange={e => {
        const type = e.target.value as QuestionKind; const next = newQuestion(type); update(index, { type, options: next.options, correct: [] });
      }}>{["single", "multiple", "boolean", "shortText", "essay"].map(type => <option key={type} value={type}>{t(`activities.${type}`)}</option>)}</select>}
      {kind === "poll" && <select aria-label={t("activities.question", { number: index + 1 })} value={q.type} onChange={e => { const type = e.target.value as QuestionKind; update(index, { type, ...(type === "boolean" ? { options: [{ id: "true", text: t("activities.true") }, { id: "false", text: t("activities.false") }] } : {}) }); }}><option value="single">{t("activities.single")}</option><option value="multiple">{t("activities.multiple")}</option><option value="boolean">{t("activities.boolean")}</option></select>}
      <label>{t("activities.prompt")}<textarea value={q.prompt} onChange={e => update(index, { prompt: e.target.value })} required maxLength={4000} rows={3} /></label>
      {kind !== "poll" && <label>{t("activities.points")}<input type="number" min={0} max={100} step={1} value={q.points} onChange={e => update(index, { points: Number(e.target.value) })} required /></label>}
      {q.options.length > 0 && <div className={styles.options}>{q.options.map((o, i) => <div className={styles.optionEdit} key={o.id}>
        {kind === "quiz" && <input type="checkbox" checked={q.correct?.includes(o.id) || false} aria-label={`${t("activities.correct")} ${i + 1}`} onChange={e => update(index, { correct: q.type === "multiple" ? (e.target.checked ? [...(q.correct || []), o.id] : (q.correct || []).filter(id => id !== o.id)) : e.target.checked ? [o.id] : [] })} />}
        <input aria-label={t("activities.option", { number: i + 1 })} value={o.text} required maxLength={500} onChange={e => update(index, { options: q.options.map((v, n) => n === i ? { ...v, text: e.target.value } : v) })} />
        {q.type !== "boolean" && q.options.length > 2 && <button type="button" aria-label={t("activities.removeOption")} onClick={() => update(index, { options: q.options.filter(v => v.id !== o.id), correct: q.correct?.filter(id => id !== o.id) })}><Trash2 /></button>}
      </div>)}{q.type !== "boolean" && q.options.length < 8 && <button type="button" onClick={() => update(index, { options: [...q.options, { id: crypto.randomUUID(), text: "" }] })}><Plus />{t("activities.addOption")}</button>}</div>}
      {q.type === "shortText" && <label>{t("activities.accepted")}<textarea value={(q.correct || []).join("\n")} required rows={3} maxLength={10000} onChange={e => update(index, { correct: e.target.value.split("\n") })} /></label>}
      {questions.length > 1 && <button type="button" onClick={() => setQuestions(old => old.filter(v => v.id !== q.id))}><Trash2 />{t("activities.removeQuestion")}</button>}
    </fieldset>)}
    {kind === "quiz" && questions.length < 50 && <button type="button" disabled={busy} onClick={() => setQuestions(old => [...old, newQuestion()])}><Plus />{t("activities.addQuestion")}</button>}
    <button type="submit" className={styles.primary} disabled={busy}>{busy ? <Loader2 className={styles.spinner} /> : <Check />}{t(busy ? "activities.busy" : "activities.saveDraft")}</button>
  </form>;
}
export function AnswerForm({ detail, busy, enabled, draft, onDraft, onSubmit }: { detail: ActivityDetail; busy: boolean; enabled: boolean; draft?: AnswerDraft; onDraft: (draft: AnswerDraft | null) => void; onSubmit: (a: ActivityAnswers, expectedVersion: number) => Promise<boolean> }) {
  const { t } = useTranslation();
  const local = draft || null;
  const answers = local?.answers ?? detail.ownResponse?.answers ?? {};
  const expectedVersion = local?.expectedVersion ?? detail.ownResponse?.version ?? 0;
  const matchesSaved = !!detail.ownResponse && answersMatch(answers, detail.ownResponse.answers);
  const changedElsewhere = !!local && !matchesSaved && expectedVersion !== (detail.ownResponse?.version ?? 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const closed = !enabled || (detail.deadlineAt ? new Date(detail.deadlineAt).getTime() <= now : false);
  const change = (next: ActivityAnswers) => { const nextDraft = { answers: next, expectedVersion }; onDraft(nextDraft); };
  return <form className={styles.editor} onSubmit={e => { e.preventDefault(); if (busy || closed) return; void onSubmit(answers, expectedVersion).then(ok => { if (ok) { onDraft(null); } }); }}>
    {detail.ownResponse && (!local || matchesSaved) && <p className={styles.noticeText}><Check />{t("activities.saved")}</p>}
    {changedElsewhere && !closed && !busy && <p className={styles.error}>{t("activities.errors.answerChanged")} <button type="button" disabled={busy} onClick={() => { if (window.confirm(t("activities.replaceDraft"))) { onDraft(null); } }}>{t("activities.loadSavedAnswer")}</button></p>}
    {detail.definition.questions.map((q, index) => <fieldset className={styles.question} disabled={busy} key={q.id}><legend>{index + 1}. {q.prompt}</legend>
      {q.options.length ? q.options.map(o => <label className={styles.choice} key={o.id}><input disabled={closed} type={q.type === "multiple" ? "checkbox" : "radio"} name={q.id} value={o.id} checked={Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(o.id)} required={q.type !== "multiple"}
        onChange={e => change({ ...answers, [q.id]: q.type === "multiple" ? (e.target.checked ? [...(answers[q.id] as string[] || []), o.id] : (answers[q.id] as string[] || []).filter(v => v !== o.id)) : [o.id] })} /><span>{o.text}</span></label>) : <textarea readOnly={closed} aria-label={q.prompt} rows={q.type === "essay" ? 5 : 2} required maxLength={10000} value={typeof answers[q.id] === "string" ? answers[q.id] as string : ""} onChange={e => change({ ...answers, [q.id]: e.target.value })} />}
    </fieldset>)}
    {local && !matchesSaved && <p className={styles.muted}>{t(closed ? "activities.retainedDraft" : "activities.unsaved")}</p>}
    {!closed && <button className={styles.primary} disabled={busy} type="submit">{busy && <Loader2 className={styles.spinner} />}{t(detail.ownResponse ? "activities.resubmit" : "activities.submit")}</button>}
  </form>;
}
export function QuestionPreview({ definition }: { definition: ActivityDefinition }) {
  const { t } = useTranslation();
  return <div className={styles.preview}>{definition.questions.map((q, index) => <section key={q.id}><h4>{index + 1}. {q.prompt}</h4>{q.options.length > 0 && <ul>{q.options.map(o => <li key={o.id}>{o.text}{q.correct?.includes(o.id) && <span className={styles.correct}><Check />{t("activities.correct")}</span>}</li>)}</ul>}{q.type === "shortText" && q.correct && <p>{t("activities.correct")}: {q.correct.join(" / ")}</p>}</section>)}</div>;
}
export function SavedResponse({ response, definition }: { response: ActivityResponse; definition: ActivityDefinition }) {
  const { t } = useTranslation(); const graded = response.grading && Object.values(response.grading).every(v => v !== null);
  return <div className={styles.saved}><h4>{t("activities.myAnswer")}</h4>{definition.questions.map(q => {
    const answer = response.answers[q.id];
    return <p key={q.id}><strong>{q.prompt}</strong><span>{Array.isArray(answer) ? answer.map(id => q.options.find(o => o.id === id)?.text || id).join(" / ") : answer}</span>{response.grading && q.points > 0 && <small>{response.grading[q.id] === null ? t("activities.pendingGrade") : `${response.grading[q.id]} / ${q.points}`}</small>}</p>;
  })}{graded && definition.questions.some(q => q.points > 0) && <strong>{t("activities.score", { score: Object.values(response.grading!).reduce<number>((a, b) => a + (b || 0), 0), total: definition.questions.reduce((a, q) => a + q.points, 0) })}</strong>}{response.feedback && <p>{t("activities.feedback")}: {response.feedback}</p>}</div>;
}
function ActivityStatistics({ detail }: { detail: ActivityDetail }) {
  const { t } = useTranslation();
  return <section className={styles.statistics}><h4><BarChart3 />{t("activities.statistics")}</h4>{detail.definition.questions.filter(q => q.options.length).map(q => <div key={q.id}><strong>{q.prompt}</strong>{q.options.map(o => <div className={styles.statRow} key={o.id}><span>{o.text}</span><meter min={0} max={Math.max(detail.responseCount, 1)} value={detail.statistics?.[q.id]?.[o.id] || 0} aria-label={o.text} /><strong>{detail.statistics?.[q.id]?.[o.id] || 0}</strong></div>)}</div>)}</section>;
}
function ResponseGrader({ response, definition, canGrade, busy, onSave }: { response: ActivityResponse; definition: ActivityDefinition; canGrade: boolean; busy: boolean; onSave: (grading: ActivityGrade, feedback: string, expectedVersion: number) => Promise<boolean> }) {
  const { t } = useTranslation(); const [open, setOpen] = useState(false);
  const [grades, setGrades] = useState<ActivityGrade>(response.grading || {}); const [feedback, setFeedback] = useState(response.feedback || "");
  const [expectedVersion, setExpectedVersion] = useState(response.version);
  return <article className={styles.response}><button type="button" className={styles.responseTitle} aria-expanded={open} onClick={() => { if (!open) { setGrades(response.grading || {}); setFeedback(response.feedback || ""); setExpectedVersion(response.version); } setOpen(!open); }}><strong>{response.displayName}</strong><time>{new Date(response.submittedAt).toLocaleTimeString()}</time><span>{response.grading && Object.values(response.grading).some(g => g === null) ? t("activities.pendingGrade") : t("activities.answer")}</span></button>
    {open && <>{canGrade && response.version !== expectedVersion && <p className={styles.error}>{t("activities.errors.gradeChanged")} <button type="button" disabled={busy} onClick={() => { setGrades(response.grading || {}); setFeedback(response.feedback || ""); setExpectedVersion(response.version); }}>{t("activities.loadLatestGrade")}</button></p>}<SavedResponse response={response} definition={definition} />{canGrade && <form className={styles.editor} onSubmit={e => { e.preventDefault(); void onSave(grades, feedback, expectedVersion).then(ok => { if (ok) setOpen(false); }); }}><fieldset disabled={busy} className={styles.grades}><legend>{t("activities.grade")}</legend>{definition.questions.map((q, i) => <label key={q.id}>{i + 1}. {q.prompt}<input type="number" min={0} max={q.points} step="any" required value={grades[q.id] ?? ""} onChange={e => setGrades(old => ({ ...old, [q.id]: e.target.value === "" ? null : Number(e.target.value) }))} /><small>/ {q.points}</small></label>)}<label>{t("activities.feedback")}<textarea rows={3} maxLength={4000} value={feedback} onChange={e => setFeedback(e.target.value)} /></label></fieldset><button type="submit" className={styles.primary} disabled={busy}>{t("activities.gradeSave")}</button></form>}</>}
  </article>;
}

/** Shared, answer-key-safe presentation included in local and DOM cloud recordings. */
export function ActivityStagePresentation({ sessionId, shareAccess, recorderToken, recordingId }: Props & { recorderToken?: string; recordingId?: string }) {
  const { t } = useTranslation();
  const [presentation, setPresentation] = useState<ActivityPresentation | null>(null);
  const read=useClassroomJsonRead(sessionId);
  useClassroomSyncTask({sessionId,taskKey:`activity-presentation:${recordingId||""}:${shareAccess||""}`,topics:["activities","resume"],
    realtimeMs:recorderToken?2000:60000,fallbackMs:recorderToken?2000:5000,background:Boolean(recorderToken),run:async signal=>{
      const data=await read<{presentation:ActivityPresentation|null}>(query(endpoint(sessionId)+"/presentation",shareAccess),{
        signal,headers:recorderToken?{"X-Classroom-Recorder":recorderToken,"X-Classroom-Recording":recordingId||""}:undefined});
      if(!signal.aborted)setPresentation(data.presentation);
    }});
  if (!presentation) return null;
  const q = presentation.question;
  return <section className={styles.stagePresentation} aria-label={t("activities.title")} data-activity-presentation>
    <header><strong>{presentation.title}</strong><small>{t(`activities.${presentation.status}`)} · {presentation.index + 1} / {presentation.questionCount}</small></header>
    <p>{q.prompt}</p>
    {q.options.length > 0 && <ul>{q.options.map(o => <li key={o.id}><span>{o.text}</span>{q.correct?.includes(o.id) && <Check aria-label={t("activities.correct")} />}{presentation.statistics && <strong>{presentation.statistics[o.id] || 0}</strong>}</li>)}</ul>}
    {q.type === "shortText" && q.correct && <small>{t("activities.correct")}: {q.correct.join(" / ")}</small>}
  </section>;
}
