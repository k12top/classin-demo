"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronRight,
  CirclePlus,
  Clock3,
  Copy,
  DoorOpen,
  Loader2,
  Network,
  Pencil,
  Repeat2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/context";
import { LargeClassBreakoutManager } from "@/components/classroom/large-class-breakout-manager";
import { useTeacherSchedules } from "@/hooks/use-teacher-schedules";
import {
  TeacherSchedulePeek,
  teacherSchedulePeekStyles,
} from "@/components/scheduling/teacher-schedule-peek";
import styles from "./course-session-manager.module.css";

type Teacher = {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
};

type Student = {
  studentId: string;
  studentName: string;
  studentAvatar?: string;
};

type GroupNode = {
  id: string;
  name: string;
  members?: Array<{ userId: string; userName?: string; userAvatar?: string }>;
  children?: GroupNode[];
};

type TeacherRule = {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  action: string;
  role: string;
};

type StudentRule = {
  studentId: string;
  studentName: string;
  studentAvatar?: string;
  action: string;
};

type GroupRule = { groupId: string; action: string };

export type CourseSessionItem = {
  id: string;
  title: string;
  position: number;
  roomType: number;
  status: string;
  startTime: string;
  endTime: string;
  teacherMode: string;
  studentMode: string;
  leadTeacherId: string | null;
  leadTeacherName: string;
  seriesId: string | null;
  teachers?: TeacherRule[];
  students?: StudentRule[];
  groupLinks?: GroupRule[];
  _count?: {
    teachers?: number;
    students?: number;
    attendances?: number;
    recordings?: number;
  };
};

type Props = {
  courseId: string;
  courseName: string;
  courseKind?: "series" | "standalone";
  roomType: number;
  canManage: boolean;
  leadTeacherId: string;
  teachers: Teacher[];
  students: Student[];
  groupLinks: Array<{ group: GroupNode }>;
  initialSessions?: CourseSessionItem[];
  onManageRoster: (role: "assistant" | "student") => void;
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const ROOM_TYPES = [0, 4, 2, 10] as const;

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultStart() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() < 30 ? 30 : 60);
  return now;
}

function initials(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "?";
}

function statusTone(status: string) {
  if (status === "live" || status === "afterClass") return styles.live;
  if (status === "finished") return styles.finished;
  if (status === "cancelled") return styles.cancelled;
  return styles.scheduled;
}

export function CourseSessionManager({
  courseId,
  courseName,
  courseKind = "series",
  roomType,
  canManage,
  leadTeacherId,
  teachers,
  students,
  groupLinks,
  initialSessions,
  onManageRoster,
}: Props) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [sessions, setSessions] = useState<CourseSessionItem[]>(initialSessions ?? []);
  const [loading, setLoading] = useState(initialSessions === undefined);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<CourseSessionItem | null>(null);
  const [editScope, setEditScope] = useState<"this" | "future">("this");
  const [saving, setSaving] = useState(false);
  const [scheduleType, setScheduleType] = useState<"single" | "recurring">("single");
  const [initialStart] = useState(() => defaultStart());
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(localInputValue(initialStart));
  const [duration, setDuration] = useState(60);
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  );
  const [weekdays, setWeekdays] = useState<number[]>([initialStart.getDay()]);
  const [occurrenceCount, setOccurrenceCount] = useState(8);
  const [teacherMode, setTeacherMode] = useState<"inherit" | "custom">("inherit");
  const [studentMode, setStudentMode] = useState<"inherit" | "custom">("inherit");
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>(
    teachers.map((teacher) => teacher.teacherId),
  );
  const [selectedStudents, setSelectedStudents] = useState<string[]>(
    students.map((student) => student.studentId),
  );
  const [sessionLeadId, setSessionLeadId] = useState(leadTeacherId);
  const [selectedRoomType, setSelectedRoomType] = useState(roomType);
  const [extraTeachers, setExtraTeachers] = useState<Teacher[]>([]);
  const [extraStudents, setExtraStudents] = useState<Student[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    groupLinks.map((link) => link.group.id),
  );
  const [studentQuery, setStudentQuery] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  const [teacherSearchResults, setTeacherSearchResults] = useState<Array<{
    id: string;
    displayName: string;
    name: string;
    avatar?: string;
  }>>([]);
  const [studentSearchResults, setStudentSearchResults] = useState<Array<{
    id: string;
    displayName: string;
    name: string;
    avatar?: string;
  }>>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [searchingTeachers, setSearchingTeachers] = useState(false);
  const [breakoutSessionId, setBreakoutSessionId] = useState<string | null>(null);
  const isStandalone = courseKind === "standalone";
  const canCreateSession = canManage && (!isStandalone || sessions.length === 0);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/sessions`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        sessions?: CourseSessionItem[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || t("courseSessions.loadFailed"));
      setSessions(payload.sessions || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("courseSessions.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    if (initialSessions !== undefined) return;
    queueMicrotask(() => void loadSessions());
  }, [initialSessions, loadSessions]);

  const availableTeachers = useMemo(() => {
    const map = new Map(teachers.map((teacher) => [teacher.teacherId, teacher]));
    for (const teacher of extraTeachers) map.set(teacher.teacherId, teacher);
    return Array.from(map.values());
  }, [extraTeachers, teachers]);

  const availableStudents = useMemo(() => {
    const map = new Map(students.map((student) => [student.studentId, student]));
    for (const student of extraStudents) map.set(student.studentId, student);
    return Array.from(map.values());
  }, [extraStudents, students]);
  const availableTeacherIds = useMemo(
    () => availableTeachers.map((teacher) => teacher.teacherId),
    [availableTeachers],
  );
  const {
    schedules: teacherSchedules,
    loading: teacherSchedulesLoading,
  } = useTeacherSchedules(availableTeacherIds, { enabled: dialogOpen, days: 7 });
  const candidateRange = useMemo(() => {
    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) return { start: null, end: null };
    return {
      start,
      end: new Date(start.getTime() + duration * 60_000),
    };
  }, [duration, startTime]);

  const enterSession = (sessionId: string) => {
    router.push(`/classroom?sessionId=${encodeURIComponent(sessionId)}`);
  };

  const toggleId = (
    value: string,
    current: string[],
    update: (next: string[]) => void,
  ) => {
    update(current.includes(value) ? current.filter((id) => id !== value) : [...current, value]);
  };

  const openCreateDialog = () => {
    const nextStart = defaultStart();
    setEditingSession(null);
    setEditScope("this");
    setScheduleType("single");
    setTitle("");
    setStartTime(localInputValue(nextStart));
    setDuration(60);
    setTeacherMode("inherit");
    setStudentMode("inherit");
    setSelectedTeachers(teachers.map((teacher) => teacher.teacherId));
    setSelectedStudents(students.map((student) => student.studentId));
    setSelectedGroupIds(groupLinks.map((link) => link.group.id));
    setSessionLeadId(leadTeacherId);
    setSelectedRoomType(roomType);
    setExtraTeachers([]);
    setExtraStudents([]);
    setTeacherQuery("");
    setTeacherSearchResults([]);
    setStudentQuery("");
    setStudentSearchResults([]);
    setError("");
    setDialogOpen(true);
  };

  const openEditDialog = (session: CourseSessionItem) => {
    const teacherRules = session.teachers || [];
    const studentRules = session.students || [];
    const groupRules = session.groupLinks || [];
    const teacherIds = new Set(
      session.teacherMode === "custom"
        ? []
        : teachers.map((teacher) => teacher.teacherId),
    );
    for (const rule of teacherRules) {
      if (rule.action === "exclude") teacherIds.delete(rule.teacherId);
      else teacherIds.add(rule.teacherId);
    }
    const studentIds = new Set(
      session.studentMode === "custom"
        ? []
        : students.map((student) => student.studentId),
    );
    for (const rule of studentRules) {
      if (rule.action === "exclude") studentIds.delete(rule.studentId);
      else studentIds.add(rule.studentId);
    }
    const groupIds = new Set(
      session.studentMode === "custom"
        ? []
        : groupLinks.map((link) => link.group.id),
    );
    for (const rule of groupRules) {
      if (rule.action === "exclude") groupIds.delete(rule.groupId);
      else groupIds.add(rule.groupId);
    }
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    setEditingSession(session);
    setEditScope("this");
    setScheduleType("single");
    setTitle(session.title || "");
    setStartTime(localInputValue(start));
    setDuration(Math.max(10, Math.round((end.getTime() - start.getTime()) / 60_000)));
    setTeacherMode(session.teacherMode === "custom" ? "custom" : "inherit");
    setStudentMode(session.studentMode === "custom" ? "custom" : "inherit");
    setSelectedTeachers(Array.from(teacherIds));
    setSelectedStudents(Array.from(studentIds));
    setSelectedGroupIds(Array.from(groupIds));
    setSessionLeadId(session.leadTeacherId || leadTeacherId);
    setSelectedRoomType(session.roomType);
    setExtraTeachers(
      teacherRules
        .filter((rule) => !teachers.some((teacher) => teacher.teacherId === rule.teacherId))
        .map((rule) => ({
          teacherId: rule.teacherId,
          teacherName: rule.teacherName || rule.teacherId,
          teacherAvatar: rule.teacherAvatar || "",
        })),
    );
    setExtraStudents(
      studentRules
        .filter((rule) => !students.some((student) => student.studentId === rule.studentId))
        .map((rule) => ({
          studentId: rule.studentId,
          studentName: rule.studentName || rule.studentId,
          studentAvatar: rule.studentAvatar || "",
        })),
    );
    setTeacherQuery("");
    setTeacherSearchResults([]);
    setStudentQuery("");
    setStudentSearchResults([]);
    setError("");
    setDialogOpen(true);
  };

  const searchSessionTeachers = async () => {
    const query = teacherQuery.trim();
    if (!query) return;
    setSearchingTeachers(true);
    try {
      const response = await fetch(
        `/api/users/search?role=teacher&limit=12&q=${encodeURIComponent(query)}`,
        { credentials: "same-origin" },
      );
      const payload = (await response.json()) as {
        users?: Array<{ id: string; displayName: string; name: string; avatar?: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || t("courseSessions.teacherSearchFailed"));
      setTeacherSearchResults(payload.users || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("courseSessions.teacherSearchFailed"));
    } finally {
      setSearchingTeachers(false);
    }
  };

  const addSessionTeacher = (user: {
    id: string;
    displayName: string;
    name: string;
    avatar?: string;
  }) => {
    const teacher = {
      teacherId: user.id,
      teacherName: user.displayName || user.name || user.id,
      teacherAvatar: user.avatar || "",
    };
    setExtraTeachers((current) =>
      current.some((item) => item.teacherId === teacher.teacherId)
        ? current
        : [...current, teacher],
    );
    setSelectedTeachers((current) =>
      current.includes(teacher.teacherId) ? current : [...current, teacher.teacherId],
    );
    setTeacherSearchResults((current) =>
      current.filter((item) => item.id !== teacher.teacherId),
    );
  };

  const searchSessionStudents = async () => {
    const query = studentQuery.trim();
    if (!query) return;
    setSearchingStudents(true);
    try {
      const response = await fetch(
        `/api/users/search?role=student&limit=12&q=${encodeURIComponent(query)}`,
        { credentials: "same-origin" },
      );
      const payload = (await response.json()) as {
        users?: Array<{ id: string; displayName: string; name: string; avatar?: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || t("courseSessions.studentSearchFailed"));
      setStudentSearchResults(payload.users || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("courseSessions.studentSearchFailed"));
    } finally {
      setSearchingStudents(false);
    }
  };

  const addTemporaryStudent = (user: {
    id: string;
    displayName: string;
    name: string;
    avatar?: string;
  }) => {
    const student = {
      studentId: user.id,
      studentName: user.displayName || user.name || user.id,
      studentAvatar: user.avatar || "",
    };
    setExtraStudents((current) =>
      current.some((item) => item.studentId === student.studentId)
        ? current
        : [...current, student],
    );
    setSelectedStudents((current) =>
      current.includes(student.studentId) ? current : [...current, student.studentId],
    );
    setStudentSearchResults((current) =>
      current.filter((item) => item.id !== student.studentId),
    );
  };

  const submit = async () => {
    const start = new Date(startTime);
    if (Number.isNaN(start.getTime()) || duration < 10) {
      setError(t("courseSessions.invalidSchedule"));
      return;
    }
    if (!selectedTeachers.includes(sessionLeadId)) {
      setError(t("courseSessions.leadRequired"));
      return;
    }
    const teacherRules = availableTeachers
      .filter((teacher) => teacherMode === "custom" || !selectedTeachers.includes(teacher.teacherId))
      .map((teacher) => ({
        userId: teacher.teacherId,
        displayName: teacher.teacherName,
        avatar: teacher.teacherAvatar || "",
        action: selectedTeachers.includes(teacher.teacherId) ? "include" : "exclude",
        role: teacher.teacherId === sessionLeadId ? "teacher" : "assistant",
      }));
    const studentRules = availableStudents
      .filter((student) => studentMode === "custom" || !selectedStudents.includes(student.studentId))
      .map((student) => ({
        userId: student.studentId,
        displayName: student.studentName,
        avatar: student.studentAvatar || "",
        action: selectedStudents.includes(student.studentId) ? "include" : "exclude",
      }));
    const groupRules = groupLinks
      .filter((link) => studentMode === "custom" || !selectedGroupIds.includes(link.group.id))
      .map((link) => ({
        groupId: link.group.id,
        action: selectedGroupIds.includes(link.group.id) ? "include" : "exclude",
      }));
    const end = new Date(start.getTime() + duration * 60_000);
    const schedule = scheduleType === "single"
      ? { type: "single", startTime: start.toISOString(), endTime: end.toISOString() }
      : {
          type: "recurring",
          timezone,
          firstDate: startTime.slice(0, 10),
          localStartTime: startTime.slice(11, 16),
          durationMinutes: duration,
          weekdays,
          count: occurrenceCount,
        };
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingSession
          ? `/api/courses/${courseId}/sessions/${editingSession.id}`
          : `/api/courses/${courseId}/sessions`,
        {
        method: editingSession ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          roomType: selectedRoomType,
          ...(editingSession
            ? {
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                scope: editScope,
              }
            : { schedule }),
          teacherMode,
          studentMode,
          leadTeacherId: sessionLeadId,
          teachers: teacherRules,
          students: studentRules,
          groups: groupRules,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || t("courseSessions.createFailed"));
      setDialogOpen(false);
      setEditingSession(null);
      setTitle("");
      await loadSessions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("courseSessions.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = async (session: CourseSessionItem) => {
    if (!window.confirm(t("courseSessions.deleteConfirm", { title: session.title }))) return;
    const response = await fetch(`/api/courses/${courseId}/sessions/${session.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || t("courseSessions.deleteFailed"));
      return;
    }
    await loadSessions();
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  return (
    <section className={styles.manager}>
      <header className={styles.header}>
        <div>
          <span>{t("courseSessions.eyebrow")}</span>
          <h2>{t("courseSessions.title")}</h2>
          <p>{t("courseSessions.description")}</p>
        </div>
        {canCreateSession ? (
          <button className={styles.createButton} type="button" onClick={openCreateDialog}>
            <CirclePlus className="h-4 w-4" />
            {t("courseSessions.schedule")}
          </button>
        ) : null}
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? (
        <div className={styles.loading}><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>
      ) : sessions.length === 0 ? (
        <button className={styles.empty} type="button" onClick={() => canCreateSession && openCreateDialog()}>
          <CalendarClock />
          <strong>{t("courseSessions.empty")}</strong>
          <span>{t(isStandalone ? "courseSessions.standaloneEmptyHint" : "courseSessions.emptyHint")}</span>
        </button>
      ) : (
        <div className={styles.timeline}>
          {sessions.map((session) => {
            const isLive = session.status === "live" || session.status === "afterClass";
            const canEnter = !["cancelled", "finished"].includes(session.status);
            return (
              <article className={styles.sessionRow} key={session.id}>
                <div className={styles.rail}>
                  <span className={`${styles.dot} ${statusTone(session.status)}`} />
                </div>
                <time>
                  <strong>{formatDate(session.startTime)}</strong>
                  <span>{Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60_000)} {t("courseSessions.minutes")}</span>
                </time>
                <div className={styles.sessionMain}>
                  <div className={styles.sessionTitle}>
                    <h3>{session.title || `${courseName} · ${session.position}`}</h3>
                    <span className={`${styles.status} ${statusTone(session.status)}`}>
                      {t(`courseSessions.status.${session.status}`)}
                    </span>
                    {session.seriesId ? <Repeat2 className="h-3.5 w-3.5" /> : null}
                  </div>
                  <div className={styles.metadata}>
                    <span className={styles.avatar}>{initials(session.leadTeacherName)}</span>
                    <span>{session.leadTeacherName}</span>
                    <span><Users className="h-3.5 w-3.5" />{session.studentMode === "inherit" ? t("courseSessions.inheritsStudents") : t("courseSessions.customStudents")}</span>
                    {session._count?.recordings ? <span>{session._count.recordings} {t("courseSessions.recordings")}</span> : null}
                  </div>
                </div>
                <div className={styles.rowActions}>
                  {canManage && session.status === "scheduled" ? (
                    <button type="button" onClick={() => openEditDialog(session)} title={t("common.edit")}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                  {roomType === 2 && canManage ? (
                    <button type="button" onClick={() => setBreakoutSessionId(breakoutSessionId === session.id ? null : session.id)} title={t("courseSessions.breakouts")}>
                      <Network className="h-4 w-4" />
                    </button>
                  ) : null}
                  {canManage ? (
                    <button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/classroom?sessionId=${session.id}`)} title={t("courseSessions.copyLink")}>
                      <Copy className="h-4 w-4" />
                    </button>
                  ) : null}
                  {canManage ? (
                    <button type="button" onClick={() => void deleteSession(session)} title={t("common.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                  {canEnter ? (
                    <button className={styles.enterButton} type="button" onClick={() => enterSession(session.id)}>
                      {isLive ? t("courseSessions.enterLive") : t("courseSessions.enter")}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {breakoutSessionId ? (
        <div className={styles.breakoutPanel}>
          <div className={styles.breakoutHeading}>
            <span><DoorOpen className="h-4 w-4" />{t("courseSessions.breakouts")}</span>
            <button type="button" onClick={() => setBreakoutSessionId(null)}><X className="h-4 w-4" /></button>
          </div>
          <LargeClassBreakoutManager
            courseId={courseId}
            sessionId={breakoutSessionId}
            canManage={canManage}
            leadTeacherId={leadTeacherId}
            teachers={teachers}
            students={students}
            groupLinks={groupLinks}
            onManageRoster={onManageRoster}
          />
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={styles.dialog}>
          <header className={styles.dialogHeader}>
            <span>{t("courseSessions.scheduleEyebrow")}</span>
            <h2>{editingSession ? t("courseSessions.editTitle") : t("courseSessions.scheduleTitle")}</h2>
            <p>{t("courseSessions.scheduleHint")}</p>
          </header>
          {editingSession ? (
            editingSession.seriesId ? (
              <div className={styles.segmented}>
                <button type="button" data-active={editScope === "this"} onClick={() => setEditScope("this")}><Clock3 />{t("courseSessions.onlyThis")}</button>
                <button type="button" data-active={editScope === "future"} onClick={() => setEditScope("future")}><Repeat2 />{t("courseSessions.thisAndFuture")}</button>
              </div>
            ) : null
          ) : isStandalone ? null : (
            <div className={styles.segmented}>
              <button type="button" data-active={scheduleType === "single"} onClick={() => setScheduleType("single")}><Clock3 />{t("courseSessions.single")}</button>
              <button type="button" data-active={scheduleType === "recurring"} onClick={() => setScheduleType("recurring")}><Repeat2 />{t("courseSessions.recurring")}</button>
            </div>
          )}
          <div className={styles.formGrid}>
            <label className={styles.full}><span>{t("courseSessions.sessionTitle")}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("courseSessions.titlePlaceholder")} /></label>
            <label><span>{t("courseSessions.startTime")}</span><input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label><span>{t("courseSessions.duration")}</span><input type="number" min={10} max={720} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
            <label><span>{t("courseSessions.roomType")}</span><select value={selectedRoomType} onChange={(event) => setSelectedRoomType(Number(event.target.value))}>{ROOM_TYPES.map((value) => <option value={value} key={value}>{t(value === 0 ? "common.roomType1v1" : value === 4 ? "common.roomTypeSmall" : value === 2 ? "common.roomTypeBig" : "common.roomTypePublic")}</option>)}</select></label>
            {!editingSession && scheduleType === "recurring" ? (
              <>
                <label><span>{t("courseSessions.timezone")}</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
                <label><span>{t("courseSessions.occurrences")}</span><input type="number" min={1} max={100} value={occurrenceCount} onChange={(event) => setOccurrenceCount(Number(event.target.value))} /></label>
                <fieldset className={styles.full}>
                  <legend>{t("courseSessions.weekdays")}</legend>
                  <div className={styles.weekdays}>
                    {WEEKDAYS.map((day) => (
                      <button key={day} type="button" data-active={weekdays.includes(day)} onClick={() => setWeekdays(weekdays.includes(day) ? weekdays.filter((value) => value !== day) : [...weekdays, day])}>
                        {t(`courseSessions.weekday.${day}`)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}
          </div>

          <div className={styles.inheritance}>
            <div>
              <header><strong>{t("courseSessions.teachers")}</strong><select value={teacherMode} onChange={(event) => setTeacherMode(event.target.value as "inherit" | "custom")}><option value="inherit">{t("courseSessions.inherit")}</option><option value="custom">{t("courseSessions.custom")}</option></select></header>
              <div className={styles.people}>
                {availableTeachers.map((teacher) => (
                  <label
                    className={`${styles.teacherSchedulePerson} ${teacherSchedulePeekStyles.trigger}`}
                    key={teacher.teacherId}
                  >
                    <input type="checkbox" checked={selectedTeachers.includes(teacher.teacherId)} onChange={() => toggleId(teacher.teacherId, selectedTeachers, setSelectedTeachers)} />
                    <span className={styles.avatar}>{initials(teacher.teacherName)}</span>
                    <span>{teacher.teacherName}</span>
                    {selectedTeachers.includes(teacher.teacherId) ? <input aria-label={t("courseSessions.setLead")} type="radio" name="session-lead" checked={sessionLeadId === teacher.teacherId} onChange={() => setSessionLeadId(teacher.teacherId)} /> : null}
                    <TeacherSchedulePeek
                      events={teacherSchedules[teacher.teacherId]?.events || []}
                      loading={teacherSchedulesLoading}
                      candidateStart={candidateRange.start}
                      candidateEnd={candidateRange.end}
                    />
                  </label>
                ))}
              </div>
              <div className={styles.memberSearch}>
                <input
                  value={teacherQuery}
                  onChange={(event) => setTeacherQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchSessionTeachers();
                    }
                  }}
                  placeholder={t("courseSessions.temporaryTeacherPlaceholder")}
                />
                <button type="button" disabled={searchingTeachers || !teacherQuery.trim()} onClick={() => void searchSessionTeachers()}>
                  {searchingTeachers ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teacherDashboard.btnSearch")}
                </button>
              </div>
              {teacherSearchResults.length ? (
                <div className={styles.searchResults}>
                  {teacherSearchResults.map((result) => (
                    <button type="button" key={result.id} onClick={() => addSessionTeacher(result)}>
                      <span className={styles.avatar}>{initials(result.displayName || result.name)}</span>
                      <span>{result.displayName || result.name}</span>
                      <CirclePlus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <header><strong>{t("courseSessions.students")}</strong><select value={studentMode} onChange={(event) => setStudentMode(event.target.value as "inherit" | "custom")}><option value="inherit">{t("courseSessions.inherit")}</option><option value="custom">{t("courseSessions.custom")}</option></select></header>
              <div className={styles.people}>
                {availableStudents.length ? availableStudents.map((student) => (
                  <label key={student.studentId}>
                    <input type="checkbox" checked={selectedStudents.includes(student.studentId)} onChange={() => toggleId(student.studentId, selectedStudents, setSelectedStudents)} />
                    <span className={styles.avatar}>{initials(student.studentName)}</span>
                    <span>{student.studentName}</span>
                  </label>
                )) : <p>{t("courseSessions.noCourseStudents")}</p>}
              </div>
              <div className={styles.memberSearch}>
                <input
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchSessionStudents();
                    }
                  }}
                  placeholder={t("courseSessions.temporaryStudentPlaceholder")}
                />
                <button type="button" disabled={searchingStudents || !studentQuery.trim()} onClick={() => void searchSessionStudents()}>
                  {searchingStudents ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teacherDashboard.btnSearch")}
                </button>
              </div>
              {studentSearchResults.length ? (
                <div className={styles.searchResults}>
                  {studentSearchResults.map((result) => (
                    <button type="button" key={result.id} onClick={() => addTemporaryStudent(result)}>
                      <span className={styles.avatar}>{initials(result.displayName || result.name)}</span>
                      <span>{result.displayName || result.name}</span>
                      <CirclePlus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              ) : null}
              {groupLinks.length ? (
                <div className={styles.groupRules}>
                  <strong>{t("courseSessions.studentGroups")}</strong>
                  {groupLinks.map((link) => (
                    <label key={link.group.id}>
                      <input type="checkbox" checked={selectedGroupIds.includes(link.group.id)} onChange={() => toggleId(link.group.id, selectedGroupIds, setSelectedGroupIds)} />
                      <span>{link.group.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {error ? <div className={styles.error}>{error}</div> : null}
          <footer className={styles.dialogFooter}>
            <button type="button" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</button>
            <button type="button" disabled={saving} onClick={() => void submit()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}{editingSession ? t("common.save") : scheduleType === "recurring" ? t("courseSessions.createSeries") : t("courseSessions.create")}</button>
          </footer>
        </DialogContent>
      </Dialog>
    </section>
  );
}
