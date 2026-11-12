"use client";

import { useState } from "react";
import { MonitorUp, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { mainScreenShareCandidates, type ScreenShareLeases } from "@/lib/classroom/screen-share-selection";
import type { ClassroomAction, ClassroomMemberSnapshot } from "@/lib/classroom/types";
import { Button } from "@/components/ui/button";
import styles from "./student-screen-shares.module.css";

export function StudentScreenShares({ members, shares, busy, onAction, onClose, inviteInitially = false }: {
  inviteInitially?: boolean;
  members: ClassroomMemberSnapshot[]; shares: ScreenShareLeases; busy: boolean;
  onAction: (action: ClassroomAction) => Promise<boolean>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [inviting, setInviting] = useState(inviteInitially);
  const [previousInvite, setPreviousInvite] = useState(inviteInitially);
  if (previousInvite !== inviteInitially) {
    setPreviousInvite(inviteInitially);
    if (inviteInitially) setInviting(true);
  }
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const candidates = mainScreenShareCandidates(shares);
  const students = members.filter(m => m.role === "student" && m.online);
  const eligibleStudents = students.filter(m => (m.screenShareState !== "requested" && !(m.screenShareState === "accepted" && m.screenShareRequestedAt)) && !candidates.some(c => c.userId === m.userId));
  const eligibleSelected = selected.filter(id => eligibleStudents.some(member => member.userId === id));
  const outstanding = members.filter(m => m.screenShareState === "requested" || (m.screenShareState === "accepted" && Boolean(m.screenShareRequestedAt)))
    .filter(m => !candidates.some(c => c.userId === m.userId));
  const unavailable = busy || sending;
  const invite = async () => {
    setSending(true);
    const remaining = [...eligibleSelected];
    try {
      for (const userId of eligibleSelected) {
        if (!await onAction({ type: "requestScreenShare", targetUserId: userId, autoDisplay: eligibleSelected.length === 1 })) break;
        remaining.splice(remaining.indexOf(userId), 1);
      }
      setSelected(remaining);
      if (!remaining.length) setInviting(false);
    } finally { setSending(false); }
  };
  return <section className={styles.panel} aria-label={t("classroomMultiShare.title")}>
    <header><h2>{t("classroomMultiShare.title")}</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label={t("classroom.v3.collapsePanel")}><X className="h-4 w-4" /></Button></header>
    <p>{t("classroomMultiShare.follows")}<br />{t("classroomMultiShare.autoDisplayHint")}</p>
    <Button variant="outline" disabled={unavailable} onClick={() => setInviting(!inviting)}><MonitorUp className="mr-2 h-4 w-4" />{t("classroomMultiShare.invite")}</Button>
    {inviting && <fieldset disabled={unavailable} className={styles.invite}>
      <legend>{t("classroomMultiShare.choose")}</legend>
      {eligibleStudents.map(member => <label key={member.userId}><input type="checkbox" checked={selected.includes(member.userId)} onChange={event => setSelected(current => event.target.checked ? [...current, member.userId] : current.filter(id => id !== member.userId))} />{member.displayName}</label>)}
      <Button disabled={!eligibleSelected.length || unavailable} onClick={() => void invite()}>{t("classroomMultiShare.send", { count: eligibleSelected.length })}</Button>
    </fieldset>}
    <div className={styles.list}>
      {candidates.map(lease => {
        const active = shares.main?.claimId === lease.claimId;
        return <article key={lease.claimId} data-current={active}>
          <div><strong>{members.find(m => m.userId === lease.userId)?.displayName || lease.userId}</strong><span>{t(active ? "classroomMultiShare.presenting" : "classroomMultiShare.ready")}</span></div>
          <div className={styles.actions}>
            <Button size="sm" variant={active ? "outline" : "default"} disabled={unavailable} onClick={() => void onAction({ type: "selectScreenShare", claimId: active ? null : lease.claimId })}>{t(active ? "classroomMultiShare.pause" : "classroomMultiShare.show")}</Button>
            {members.find(m => m.userId === lease.userId)?.role === "student" && <Button size="sm" variant="ghost" disabled={unavailable} onClick={() => void onAction({ type: "stopScreenShare", targetUserId: lease.userId })}>{t("classroomMultiShare.end")}</Button>}
          </div>
        </article>;
      })}
      {outstanding.map(member => <article key={member.userId}><div><strong>{member.displayName}</strong><span>{t(member.screenShareState === "requested" ? "classroomMultiShare.invited" : "classroomMultiShare.preparing")}</span></div><Button size="sm" variant="ghost" disabled={unavailable} onClick={() => void onAction({ type: "stopScreenShare", targetUserId: member.userId })}>{t("classroomMultiShare.cancel")}</Button></article>)}
      {!candidates.length && !outstanding.length && <p>{t("classroomMultiShare.empty")}</p>}
    </div>
  </section>;
}
