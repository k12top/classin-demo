"use client";
/* eslint-disable @next/next/no-img-element -- Small identity avatars use provider URLs. */
import { Check, Clock3, Minus, X } from "lucide-react";
import type { ActivityJudgment, ActivityRosterMember } from "@/lib/classroom/activities";
import styles from "./activity-interaction.module.css";

export function ActivityAvatar({ person, updated = false, judgment }: {
  person: Pick<ActivityRosterMember, "userId" | "displayName" | "avatar">; updated?: boolean; judgment?: ActivityJudgment;
}) {
  const hue = Array.from(person.userId).reduce((n, c) => n + c.charCodeAt(0), 0) % 7;
  const Icon = judgment === "correct" ? Check : judgment === "incorrect" ? X : judgment === "pending" ? Clock3 : Minus;
  return <span className={`${styles.person} ${updated ? styles.updated : ""}`} data-color={hue} aria-hidden="true">
    {Array.from(person.displayName.trim())[0] || "?"}
    {person.avatar && <img src={person.avatar} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    {judgment && judgment !== "unanswered" && <i className={styles.answerBadge} data-judgment={judgment}><Icon /></i>}
  </span>;
}
