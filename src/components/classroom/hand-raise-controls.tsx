"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Hand, Loader2, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { raisedClassroomHands } from "@/lib/classroom/hand-raise";
import type { ClassroomAction, ClassroomMemberSnapshot } from "@/lib/classroom/types";

export function HandRaiseVideoBadge({ member }: {
  member?: Pick<ClassroomMemberSnapshot, "role" | "onStage" | "handRaisedAt">;
}) {
  const { t } = useTranslation();
  if (member?.role !== "student" || !member.onStage || !member.handRaisedAt) return null;
  const label = t("classroom.v3.handRaised");
  return <span className="classroom-v3-video-hand-raised" role="img" aria-label={label} title={label}>
    <Hand aria-hidden="true" />
  </span>;
}

export function HandRaiseButton({ raised, busy, onToggle }: {
  raised: boolean; busy: boolean; onToggle: () => void;
}) {
  const { t } = useTranslation();
  const label = t(raised ? "classroom.v3.cancelHand" : "classroom.v3.raiseHand");
  return <button type="button" className={`classroom-v3-hand-raise-button ${raised ? "is-active" : ""}`}
    disabled={busy} aria-busy={busy} aria-pressed={raised} aria-label={label} title={label} onClick={onToggle}>
    {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Hand aria-hidden="true" />}
    <span>{label}</span>
  </button>;
}

export function HandRaiseQueue({ members, busy, onAction, onViewMembers }: {
  members: ClassroomMemberSnapshot[]; busy: boolean;
  onAction: (action: ClassroomAction) => Promise<boolean>;
  onViewMembers: () => void;
}) {
  const { t } = useTranslation();
  const queue = raisedClassroomHands(members);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={container} className="classroom-v3-hand-raise-menu" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" className={`classroom-v3-hand-raise-button ${queue.length ? "is-active" : ""}`}
      aria-label={t("classroom.v3.handRaiseQueue")} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(current => !current)}>
      <Hand aria-hidden="true" /><span>{t("classroom.v3.handRaiseQueue")}</span>
      {queue.length > 0 && <strong className="classroom-v3-hand-count">{queue.length}</strong>}
    </button>
    <span className="sr-only" role="status" aria-live="polite">{queue.length ? t("classroom.v3.handRaiseWaiting", { count: queue.length }) : t("classroom.v3.noHands")}</span>
    {open && <section id={panelId} className="classroom-v3-hand-raise-popover" aria-label={t("classroom.v3.handRaiseQueue")}>
      <header><strong>{t("classroom.v3.handRaiseWaiting", { count: queue.length })}</strong>
        <button type="button" aria-label={t("common.dismiss")} onClick={close}><X aria-hidden="true" /></button></header>
      {queue.length ? <ol>{queue.map(member => <li key={member.userId}>
        <span><strong>{member.displayName}</strong><small>{t(member.onStage ? "classroom.v3.onStage" : "classroom.v3.handRaiseOffstage")}</small></span>
        <button type="button" disabled={busy || member.stageState === "invited"} onClick={async () => {
          if (member.onStage && member.microphoneAllowed) { onViewMembers(); close(); return; }
          const saved = await onAction(member.onStage
            ? { type: "setMediaAllowed", targetUserId: member.userId, microphoneAllowed: true, cameraAllowed: member.cameraAllowed }
            : { type: "inviteStage", targetUserId: member.userId });
          if (saved) close();
        }}>{t(member.stageState === "invited" ? "classroom.v3.stageInvitationPending" : member.onStage
          ? member.microphoneAllowed ? "classroom.v3.handRaiseViewStudent" : "classroom.v3.allowSpeaking"
          : "classroom.v3.inviteStage")}</button>
      </li>)}</ol> : <p>{t("classroom.v3.noHands")}</p>}
    </section>}
  </div>;
}
