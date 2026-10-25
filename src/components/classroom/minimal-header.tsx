"use client";
import { ClassroomIconButton } from "./icon-button";

import type { ReactNode } from "react";
import { ArrowLeft, ChevronDown, Clock3, Users, Expand, Radio, CircleStop, CircleDot, WifiOff, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/context";
import { lessonClock, lessonClockText } from "@/lib/classroom/lesson-clock";
import TimeDisplay from "@/components/TimeDisplay";
import { ClassTimingControls, type ClassTiming } from "./class-timing-controls";
import { ClassroomHeaderMenu, type ClassroomHeaderMenuAction } from "./classroom-header-menu";

export function MinimalHeader({ course, runtime, now, roleName, memberCount, recording, connectionState, presenceHealthy, canStart, canEnd, canExtend, busy, status, settings, notices, actions, onBack, onStart, onEnd, onExtended, onRestarted, onMembers, onFullscreen }: {
  course: { id: string; sessionId: string; name: string; startTime: string | null; endTime: string | null };
  runtime: { status: "waiting" | "live" | "ended"; startedAt: string | null; graceEndsAt: string | null };
  connectionState: string; presenceHealthy: boolean; now: number; roleName: string; memberCount: number; recording: boolean; canStart: boolean; canEnd: boolean; canExtend: boolean; busy: boolean;
  status: ReactNode; settings: ReactNode; notices?: ReactNode; actions: ClassroomHeaderMenuAction[];
  onBack: () => void; onStart: () => void; onEnd: () => void; onExtended: (timing: ClassTiming) => void; onRestarted: () => void; onMembers?: () => void; onFullscreen: () => void;
}) {
  const { t } = useTranslation();
  const clock = lessonClock({ ...runtime, ...course, now });
  const label = t(`classroomMinimal.${clock.phase === "closing" && clock.remainingGrace === 0 ? "ending" : clock.phase}`);
  const text = clock.seconds === null ? label : `${clock.phase === "overtime" || clock.phase === "closing" ? "+" : ""}${lessonClockText(clock.seconds)}`;
  return <header className="classroom-v3-topbar classroom-minimal-header">
    <ClassroomIconButton type="button" className="classroom-minimal-icon" title={t("classroom.v3.backToCourse")} aria-label={t("classroom.v3.backToCourse")} onClick={onBack}><ArrowLeft /></ClassroomIconButton>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><ClassroomIconButton className="classroom-minimal-course" type="button" title={course.name}><span className="classroom-minimal-course-name">{course.name}</span><ChevronDown /></ClassroomIconButton></DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={8} sideOffset={8} className="classroom-header-menu classroom-course-menu">
        <div className="classroom-course-summary"><strong>{course.name}</strong><span>{roleName}</span></div>
        <div className="classroom-course-times"><span>{t("classroomMinimal.scheduled")}</span><span><TimeDisplay isoString={course.startTime} options={{ hour: "2-digit", minute: "2-digit" }} /> — <TimeDisplay isoString={course.endTime} options={{ hour: "2-digit", minute: "2-digit" }} /></span></div>
        <div className="classroom-course-times" data-tone={clock.tone}><span>{label}</span><strong>{text}</strong></div>
        {clock.elapsed !== null && clock.overtime > 0 && <div className="classroom-course-times"><span>{t("classroomMinimal.elapsed")}</span><span>{lessonClockText(clock.elapsed)}</span></div>}
        {clock.remainingGrace !== null && <div className="classroom-course-times"><span>{t("classroomMinimal.closesIn")}</span><span>{lessonClockText(clock.remainingGrace)}</span></div>}
        <div className="classroom-course-connection">{status}</div>
        {(canStart || canExtend || canEnd) && <DropdownMenuSeparator />}
        {canStart && <DropdownMenuItem disabled={busy} onSelect={onStart}><Radio />{t("classroom.v3.startClass")}</DropdownMenuItem>}
        {canExtend && <ClassTimingControls courseId={course.id} sessionId={course.sessionId} ended={runtime.status === "ended"} onExtended={onExtended} onRestarted={onRestarted} />}
        {canEnd && <DropdownMenuItem className="is-danger" disabled={busy} onSelect={onEnd}><CircleStop />{t("classroom.v3.endClass")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><ClassroomIconButton type="button" className="classroom-lesson-clock" data-phase={clock.phase} data-tone={clock.tone} aria-label={`${label} ${text}`} title={`${label} ${text}`}><Clock3 /><span>{clock.seconds !== null && clock.phase !== "live" && <small>{label}</small>}<strong>{text}</strong></span></ClassroomIconButton></DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="classroom-header-menu"><div className="classroom-course-times"><span>{label}</span><strong>{text}</strong></div>{clock.remainingGrace !== null && <div className="classroom-course-times"><span>{t("classroomMinimal.closesIn")}</span><span>{lessonClockText(clock.remainingGrace)}</span></div>}{status}</DropdownMenuContent>
    </DropdownMenu>
    {runtime.status !== "ended" && (connectionState !== "connected" || !presenceHealthy) && <span className="classroom-minimal-connection-warning" role="status" title={t(connectionState === "disconnected" ? "classroomMinimal.offline" : "classroom.v3.reconnecting")} aria-label={t(connectionState === "disconnected" ? "classroomMinimal.offline" : "classroom.v3.reconnecting")}>{connectionState === "disconnected" ? <WifiOff/> : <Loader2 className="animate-spin"/>}</span>}
    {recording && <span className="classroom-minimal-recording" title={t("classroomMinimal.recording")} aria-label={t("classroomMinimal.recording")}><CircleDot /></span>}
    {canStart && <ClassroomIconButton type="button" className="classroom-minimal-icon classroom-minimal-start" disabled={busy} aria-label={t("classroom.v3.startClass")} title={t("classroom.v3.startClass")} onClick={onStart}><Radio /></ClassroomIconButton>}
    {onMembers && <ClassroomIconButton type="button" className="classroom-minimal-icon classroom-minimal-wide" title={t("classroom.v3.members")} aria-label={`${t("classroom.v3.members")} (${presenceHealthy ? memberCount : "—"})`} onClick={onMembers}><Users /><small>{presenceHealthy ? memberCount : "—"}</small></ClassroomIconButton>}
    <ClassroomIconButton type="button" className="classroom-minimal-icon classroom-minimal-wide" title={t("classroom.v3.fullscreen")} aria-label={t("classroom.v3.fullscreen")} onClick={onFullscreen}><Expand /></ClassroomIconButton>
    {settings}
    <ClassroomHeaderMenu actions={actions} />
    {notices}
  </header>;
}
