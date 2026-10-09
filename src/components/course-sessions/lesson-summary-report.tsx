"use client";

import { PlayCircle, X } from "lucide-react";
import type { CourseSessionSummaryReport, SummaryEvidence } from "@/lib/course-session-summary-document";

export function lessonSummaryReportCopy(locale: string) {
  return locale.startsWith("zh") ? {
    participants: "个人发言总结", discussion: "讨论脉络", actions: "作业与行动项",
    conclusions: "结论与学习结果", followUps: "待跟进问题", keyPoints: "核心观点", commitments: "明确承诺",
    topic: "主题", summary: "内容", title: "任务", owner: "负责人", due: "截止时间", description: "说明",
    reason: "跟进原因", nextCheck: "下次检查", status: "状态", evidence: "回看原话", remove: "移除条目", add: "添加行动项",
    statuses: { pending: "待完成", "in-progress": "进行中", completed: "已完成", blocked: "受阻", cancelled: "已取消" },
  } : {
    participants: "Participant summaries", discussion: "Discussion threads", actions: "Assignments and actions",
    conclusions: "Conclusions and learning outcomes", followUps: "Open questions and follow-ups", keyPoints: "Key points", commitments: "Explicit commitments",
    topic: "Topic", summary: "Content", title: "Task", owner: "Owner", due: "Due", description: "Description",
    reason: "Reason", nextCheck: "Next check", status: "Status", evidence: "Review source", remove: "Remove item", add: "Add action",
    statuses: { pending: "Pending", "in-progress": "In progress", completed: "Completed", blocked: "Blocked", cancelled: "Cancelled" },
  };
}

type Props = {
  report: CourseSessionSummaryReport;
  locale: string;
  onChange?: (report: CourseSessionSummaryReport) => void;
  evidenceLink?: (evidence: SummaryEvidence) => { label: string; seek: () => void } | null;
};
export function LessonSummaryReport({ report, locale, onChange, evidenceLink }: Props) {
  const copy = lessonSummaryReportCopy(locale);
  const editing = Boolean(onChange);
  const update = <K extends keyof CourseSessionSummaryReport>(key: K, index: number, patch: Partial<CourseSessionSummaryReport[K][number]>) => {
    onChange?.({ ...report, [key]: report[key].map((item, position) => position === index ? { ...item, ...patch } : item) });
  };
  const remove = (key: keyof CourseSessionSummaryReport, index: number) => onChange?.({ ...report, [key]: report[key].filter((_, position) => position !== index) });
  const source = (evidence: SummaryEvidence) => {
    const link = evidenceLink?.(evidence);
    return !editing && link ? <button type="button" onClick={link.seek} className="mt-3 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
      <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />{copy.evidence} · {link.label}
    </button> : null;
  };
  const removeButton = (key: keyof CourseSessionSummaryReport, index: number) => editing ? <button type="button" onClick={() => remove(key, index)} aria-label={copy.remove} className="float-right rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"><X className="h-4 w-4" /></button> : null;
  return <div className="space-y-7">
    <ReportSection title={copy.discussion} count={report.discussionThreads.length}>
      {report.discussionThreads.map((item, index) => <ReportCard key={index}>
        {removeButton("discussionThreads", index)}
        <ReportField label={copy.topic} value={item.topic} editing={editing} heading onChange={(topic) => update("discussionThreads", index, { topic })} />
        {item.participants.length > 0 && <p className="mb-2 text-xs text-primary">{item.participants.join(" · ")}</p>}
        <ReportField label={copy.summary} value={item.summary} editing={editing} onChange={(summary) => update("discussionThreads", index, { summary })} />
        {source(item.evidence)}
      </ReportCard>)}
    </ReportSection>
    <ReportSection title={copy.participants} count={report.participantSummaries.length}>
      {report.participantSummaries.map((item, index) => <ReportCard key={item.speakerId}>
        {removeButton("participantSummaries", index)}
        <h5 className="mb-2 text-sm font-semibold text-foreground">{item.speakerName}</h5>
        <ReportField label={copy.summary} value={item.summary} editing={editing} onChange={(summary) => update("participantSummaries", index, { summary })} />
        <ReportField label={copy.keyPoints} value={item.keyPoints.join("\n")} editing={editing} list onChange={(value) => update("participantSummaries", index, { keyPoints: split(value) })} />
        <ReportField label={copy.commitments} value={item.commitments.join("\n")} editing={editing} list onChange={(value) => update("participantSummaries", index, { commitments: split(value) })} />
        {source(item.evidence)}
      </ReportCard>)}
    </ReportSection>
    <ReportSection title={copy.conclusions} count={report.conclusions.length}>
      {report.conclusions.map((item, index) => <ReportCard key={index}>
        {removeButton("conclusions", index)}
        <ReportField label={copy.topic} value={item.title} editing={editing} heading onChange={(title) => update("conclusions", index, { title })} />
        <ReportField label={copy.summary} value={item.detail} editing={editing} onChange={(detail) => update("conclusions", index, { detail })} />
        {source(item.evidence)}
      </ReportCard>)}
    </ReportSection>
    <ReportSection title={copy.actions} count={report.actionItems.length || Number(editing)}>
      {report.actionItems.map((item, index) => <ReportCard key={index}>
        {removeButton("actionItems", index)}
        <ReportField label={copy.title} value={item.title} editing={editing} heading onChange={(title) => update("actionItems", index, { title })} />
        <div className={editing ? "grid gap-2 sm:grid-cols-2" : "mt-2 flex flex-wrap gap-x-4 gap-y-1"}>
          <ReportField label={copy.owner} value={item.owner} editing={editing} metadata onChange={(owner) => update("actionItems", index, { owner })} />
          <ReportField label={copy.due} value={item.due} editing={editing} metadata onChange={(due) => update("actionItems", index, { due })} />
        </div>
        {editing ? <label className="my-2 block text-xs text-muted-foreground">{copy.status}
          <select value={item.status} onChange={(event) => update("actionItems", index, { status: event.target.value })} className="mt-1 block w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground">
            {Object.entries(copy.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label> : <span className="my-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{copy.statuses[item.status as keyof typeof copy.statuses] || copy.statuses.pending}</span>}
        <ReportField label={copy.description} value={item.description} editing={editing} onChange={(description) => update("actionItems", index, { description })} />
        {source(item.evidence)}
      </ReportCard>)}
      {editing && <button type="button" className="rounded-lg border border-dashed border-primary/40 px-3 py-2 text-sm text-primary hover:bg-primary/5" onClick={() => onChange?.({ ...report, actionItems: [...report.actionItems, { title: "", owner: "", due: "", status: "pending", description: "", evidence: { captionIds: [] } }] })}>{copy.add}</button>}
    </ReportSection>
    <ReportSection title={copy.followUps} count={report.followUps.length}>
      {report.followUps.map((item, index) => <ReportCard key={index}>
        {removeButton("followUps", index)}
        <ReportField label={copy.topic} value={item.topic} editing={editing} heading onChange={(topic) => update("followUps", index, { topic })} />
        <ReportField label={copy.reason} value={item.reason} editing={editing} onChange={(reason) => update("followUps", index, { reason })} />
        <div className={editing ? "grid gap-2 sm:grid-cols-2" : "mt-2 flex flex-wrap gap-x-4 gap-y-1"}>
          <ReportField label={copy.owner} value={item.owner} editing={editing} metadata onChange={(owner) => update("followUps", index, { owner })} />
          <ReportField label={copy.nextCheck} value={item.nextCheckAt} editing={editing} metadata onChange={(nextCheckAt) => update("followUps", index, { nextCheckAt })} />
        </div>
        {source(item.evidence)}
      </ReportCard>)}
    </ReportSection>
  </div>;
}
function split(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
function ReportSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return count > 0 ? <section><h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4><div className="space-y-3">{children}</div></section> : null;
}
function ReportCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border/60 bg-muted/20 p-4">{children}</div>;
}
function ReportField({ label, value, editing, onChange, heading, list, metadata }: {
  label: string; value: string; editing: boolean; onChange: (value: string) => void; heading?: boolean; list?: boolean; metadata?: boolean;
}) {
  if (editing) return <label className="mb-2 block space-y-1 text-xs text-muted-foreground">
    <span>{label}</span>
    <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={heading || metadata ? 1 : 3} className="block w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
  </label>;
  if (!value) return null;
  if (list) return <div className="mt-3"><p className="text-xs font-medium text-foreground">{label}</p><ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-6 text-muted-foreground">{split(value).map((line) => <li key={line}>{line}</li>)}</ul></div>;
  return <p className={heading ? "mb-2 text-sm font-semibold text-foreground" : metadata ? "text-xs text-muted-foreground" : "whitespace-pre-line text-sm leading-6 text-muted-foreground"}>{metadata ? `${label}：` : ""}{value}</p>;
}
