"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { activityQuestionJudgment, type ActivityDetail } from "@/lib/classroom/activities";
import { activityAnswerGroups } from "@/lib/classroom/activity-statistics";
import { interactionCopy } from "@/lib/classroom/interaction-copy";
import { useTranslation } from "@/lib/i18n/context";
import { MarkdownContent } from "@/components/markdown-content";
import { ActivityAvatar } from "./activity-avatar";
import styles from "./activity-interaction.module.css";

export function ActivityDistribution({ detail, onInspect }: { detail: ActivityDetail; onInspect: (userId: string) => void }) {
  const { locale } = useTranslation(), c = interactionCopy(locale), id = useId();
  const [hover, setHover] = useState<{ questionId: string; key: string; left: number; top: number; pinned: boolean } | null>(null);
  const panel = useRef<HTMLDivElement>(null), anchor = useRef<HTMLElement | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!hover) return;
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && (panel.current?.contains(event.target as Node) || (event.target as Element).closest?.('[data-answer-distribution]'))) return;
      setHover(null);
    };
    document.addEventListener("click", dismiss); document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("click", dismiss); document.removeEventListener("keydown", dismiss); };
  }, [hover]);
  useEffect(() => {
    if (!hover) return;
    const reposition = () => {
      if (!anchor.current?.isConnected) { setHover(null); return; }
      const rect = anchor.current.getBoundingClientRect(), width = Math.min(310, innerWidth - 24);
      setHover(current => current && ({ ...current, left: Math.max(12, Math.min(innerWidth - width - 12, rect.left)), top: Math.max(12, Math.min(innerHeight - 260, rect.bottom + 6)) }));
    };
    const onScroll = (event: Event) => {
      const source = event.target;
      if (!(source instanceof Node) || panel.current?.contains(source) || (source !== document && !source.contains(anchor.current))) return;
      if (!anchor.current?.isConnected) { setHover(null); return; }
      const rect = anchor.current.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { setHover(null); return; }
      reposition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", onScroll, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", onScroll, true); };
  }, [hover]);
  const question = detail.definition.questions.find(question => question.id === hover?.questionId);
  const selected = question && activityAnswerGroups(question, detail.roster || []).find(group => group.key === hover?.key);
  const open = (anchorElement: HTMLElement, questionId: string, key: string, pinned = false) => {
    clearTimeout(timer.current);
    if (hover?.pinned && !pinned) return;
    anchor.current = anchorElement;
    const rect = anchorElement.getBoundingClientRect(), width = Math.min(310, innerWidth - 24);
    setHover({ questionId, key, pinned, left: Math.max(12, Math.min(innerWidth - width - 12, rect.left)), top: Math.max(12, Math.min(innerHeight - 260, rect.bottom + 6)) });
  };
  const close = () => { if (!hover?.pinned) { clearTimeout(timer.current); timer.current = setTimeout(() => { if (document.activeElement !== anchor.current && !panel.current?.contains(document.activeElement)) setHover(null); }, 220); } };
  return <>
    {detail.definition.questions.map(q => <div key={q.id} className={styles.distribution} aria-label={c.autoJudgment}>
      {detail.questionCount > 1 && <MarkdownContent content={q.prompt} />}
      {activityAnswerGroups(q, detail.roster || []).map(group => {
        const count = detail.roster ? group.members.length : detail.statistics?.[q.id]?.[group.key] || 0;
        return <div key={group.key} role="button" tabIndex={0} data-answer-distribution aria-label={`${group.letter} ${group.label} · ${count} ${c.people}`} aria-controls={id} aria-expanded={hover?.questionId === q.id && hover.key === group.key}
          style={{ "--ratio": `${detail.responseCount ? count / detail.responseCount * 100 : 0}%` } as CSSProperties}
          onPointerEnter={event => { if (event.pointerType !== "touch") open(event.currentTarget, q.id, group.key); }} onPointerLeave={close} onFocus={event => open(event.currentTarget, q.id, group.key)} onBlur={close}
          onClick={event => open(event.currentTarget, q.id, group.key, true)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(event.currentTarget, q.id, group.key, true); } }}>
          <span className={styles.optionLetter}>{group.letter}</span><MarkdownContent className={styles.optionText} content={group.label} /><b>{count}</b>
        </div>;
      })}
    </div>)}
    {hover && question && selected && createPortal(<div id={id} ref={panel} className={`${styles.rosterPopover} ${styles.surface}`} role="region" aria-label={c.optionStudents} style={{ left: hover.left, top: hover.top, maxHeight: `min(345px, max(0px, calc(100dvh - ${hover.top}px - 12px)))` }} onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={close} onBlur={close}>
      <header><strong>{c.optionStudents} · {selected.members.length}</strong><button type="button" aria-label={c.closeRoster} onClick={() => setHover(null)}><X /></button></header>
      {selected.members.map(member => <div key={member.userId} className={styles.rosterRow}><ActivityAvatar person={member} judgment={activityQuestionJudgment(question, member.response)} /><button type="button" onClick={() => { onInspect(member.userId); setHover(null); }}>{member.displayName}</button><span data-judgment={activityQuestionJudgment(question, member.response)}>{c[activityQuestionJudgment(question, member.response) === "pending" ? "pendingGrade" : activityQuestionJudgment(question, member.response)]}</span></div>)}
      {!selected.members.length && <p>{c.noAnswer}</p>}
    </div>, document.body)}
  </>;
}
