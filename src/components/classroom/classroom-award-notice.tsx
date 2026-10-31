"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Trophy } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ClassroomMemberSnapshot } from "@/lib/classroom/types";
import { TrophyModel } from "./trophy-model";
import styles from "./classroom-award-notice.module.css";

type AwardNotice = { id: number; sessionId: string; names: string[]; ownTotal?: number };
type TargetResolver = () => HTMLElement | null;

function ownSeatBadge(viewerId: string) {
  return document.querySelector<HTMLElement>(`.classroom-v3-seat-reward[data-reward-user-id="${CSS.escape(viewerId)}"]`);
}
function visibleSeatBadge(viewerId: string) {
  const badge = ownSeatBadge(viewerId);
  if (!badge) return null;
  const rect = badge.getBoundingClientRect();
  const strip = badge.closest(".classroom-v3-seats")?.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.left < Math.max(0, strip?.left ?? 0) ||
    rect.right > Math.min(innerWidth, strip?.right ?? innerWidth) || rect.top < 0 || rect.bottom > innerHeight) return null;
  return badge;
}
function revealOwnSeat(viewerId: string) {
  const badge = ownSeatBadge(viewerId), strip = badge?.closest<HTMLElement>(".classroom-v3-seats");
  if (!badge || !strip || !badge.getClientRects().length) return;
  const rect = badge.getBoundingClientRect(), clip = strip.getBoundingClientRect();
  const delta = rect.right > clip.right ? rect.right - clip.right + 16 : rect.left < clip.left ? rect.left - clip.left - 16 : 0;
  if (delta) strip.scrollBy({ left: delta, behavior: "smooth" });
}

function AwardPresentation({ notice, viewerId, resolveTarget, reducedMotion }: {
  notice: AwardNotice; viewerId: string; resolveTarget: TargetResolver; reducedMotion: boolean;
}) {
  const { t } = useTranslation();
  const trophy = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState("celebrate");
  const personal = notice.ownTotal !== undefined;
  useEffect(() => {
    if (!personal || reducedMotion) return;
    const reveal = window.setTimeout(() => revealOwnSeat(viewerId), 250);
    let frame = 0;
    let pulse: Animation | undefined;
    const begin = window.setTimeout(() => {
      const element = trophy.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const start = performance.now();
      setPhase("flying");
      const fly = (now: number) => {
        const target = resolveTarget();
        const t = Math.min((now - start) / 850, 1);
        if (document.visibilityState === "hidden") { element.style.opacity = "0"; setPhase("landed"); return; }
        if (target) {
          // Resolve live coordinates, including rail scroll and orientation changes.
          const goal = (target.querySelector("svg") ?? target).getBoundingClientRect();
          const parent = element.parentElement!.getBoundingClientRect();
          const end = { x: goal.left + goal.width / 2, y: goal.top + goal.height / 2 };
          const u = 1 - (1 - t) ** 2, v = 1 - u;
          const x = v ** 3 * from.x + 3 * v ** 2 * u * (from.x + (end.x - from.x) * .25) + 3 * v * u ** 2 * (end.x - (end.x - from.x) * .18) + u ** 3 * end.x;
          const y = v ** 3 * from.y + 3 * v ** 2 * u * (from.y - 100) + 3 * v * u ** 2 * (end.y + (end.y < from.y ? 65 : -65)) + u ** 3 * end.y;
          const scale = Math.exp(Math.log(Math.max(.06, Math.min(.2, goal.width / (parent.width * .72)))) * u);
          element.style.transform = `translate3d(${x - parent.left - parent.width / 2}px, ${y - parent.top - parent.height / 2}px, 0) rotate(${-12 * Math.sin(u * Math.PI)}deg) scale(${scale})`;
          element.style.opacity = String(t > .92 ? (1 - t) / .08 : 1);
          element.dataset.flightTarget = target.dataset.rewardUserId ? "seat" : "personal-counter";
        }
        if (t < 1) frame = requestAnimationFrame(fly);
        else {
          element.style.opacity = "0";
          pulse = target?.animate([{ transform: "scale(1)" }, { transform: "scale(1.28)", offset: .4 }, { transform: "scale(1)" }],
            { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" });
          setPhase("landed");
        }
      };
      frame = requestAnimationFrame(fly);
    }, 1_450);
    return () => { clearTimeout(reveal); clearTimeout(begin); cancelAnimationFrame(frame); pulse?.cancel(); };
  }, [personal, viewerId, resolveTarget, reducedMotion]);

  return <motion.div className={`classroom-v3-award-notice ${styles.notice} ${personal ? styles.personal : styles.broadcast}`}
    data-personal={personal} data-phase={phase} data-awarded-user-id={personal ? viewerId : undefined}
    role="status" aria-live="polite" aria-atomic="true"
    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: .94 }}
    animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reducedMotion ? .12 : .28, ease: [.16, 1, .3, 1] }}>
    <div className={styles.symbol} aria-hidden="true">
      {personal ? <>
        <span className={styles.ring} />
        {Array.from({ length: 12 }, (_, index) => <i key={index} className={styles.particle}
          style={{ "--award-angle": `${index * 30}deg`, "--award-delay": `${index % 3 * 40}ms` } as CSSProperties} />)}
        <div ref={trophy} className={styles.flyingTrophy} data-award-trophy><TrophyModel reducedMotion={reducedMotion} /></div>
      </> : <Trophy />}
    </div>
    <div className={styles.caption}>
      <div className={styles.copy}>
        <strong>{t(personal ? "classroom.v3.awardForYou" : "classroom.v3.awardReceived")}</strong>
        <span>{personal ? t("classroom.v3.awardFromTeacher") : notice.names.join(" · ")}</span>
      </div>
      {personal && <span className={styles.total}><Trophy aria-hidden="true" />{t("classroom.v3.awardTotal", { count: notice.ownTotal! })}</span>}
    </div>
  </motion.div>;
}

export function ClassroomAwardNotice({ sessionId, members, viewerId, disabled = false }: {
  sessionId: string; members: ClassroomMemberSnapshot[]; viewerId: string; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion() === true;
  const baseline = useRef<{ sessionId: string; counts: Map<string, number> } | null>(null);
  const sequence = useRef(0), counter = useRef<HTMLSpanElement>(null);
  const [notice, setNotice] = useState<AwardNotice | null>(null);
  const [showCounter, setShowCounter] = useState(false);
  const own = members.find(member => member.userId === viewerId);
  const ownTotal = own?.role === "student" ? own.rewardCount : 0;
  const resolveTarget = useCallback(() => visibleSeatBadge(viewerId) ?? counter.current, [viewerId]);

  useEffect(() => {
    const previous = baseline.current;
    baseline.current = { sessionId, counts: new Map(members.map(member => [member.userId, member.rewardCount])) };
    if (disabled || previous?.sessionId !== sessionId) return;
    const recipients = members.filter(member => previous.counts.has(member.userId) && member.rewardCount > previous.counts.get(member.userId)!);
    if (recipients.length) setNotice({ id: ++sequence.current, sessionId, names: recipients.map(member => member.displayName),
      ownTotal: recipients.find(member => member.userId === viewerId)?.rewardCount });
  }, [sessionId, members, viewerId, disabled]);

  useEffect(() => {
    if (!ownTotal || disabled) return;
    let frame = 0;
    const measure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setShowCounter(!visibleSeatBadge(viewerId))); };
    measure();
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    const observer = new MutationObserver(measure);
    const rail = document.querySelector(".classroom-v3-live-rail");
    if (rail) observer.observe(rail, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-collapsed"] });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("scroll", measure, true); };
  }, [ownTotal, disabled, viewerId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3_200);
    return () => clearTimeout(timer);
  }, [notice]);

  return <>
    {!disabled && ownTotal > 0 && showCounter && <span ref={counter} className={styles.personalCounter}
      data-award-personal-counter={viewerId} aria-label={t("classroom.v3.awardTotal", { count: ownTotal })}>
      <Trophy aria-hidden="true" /><span>{ownTotal}</span>
    </span>}
    <AnimatePresence mode="wait">
      {!disabled && notice?.sessionId === sessionId && <AwardPresentation key={notice.id} notice={notice}
        viewerId={viewerId} resolveTarget={resolveTarget} reducedMotion={reducedMotion} />}
    </AnimatePresence>
  </>;
}
