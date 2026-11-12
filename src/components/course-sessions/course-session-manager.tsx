"use client";

import { copyInvitationText } from "@/lib/invitation-sharing";
import { classroomVerifyAccessPath } from "@/lib/classroom/entry-path";
import { openClassroomWindow, reserveClassroomWindow } from "@/lib/classroom/open-desktop-window";
import { workspaceRequest } from "@/lib/workspace-client";
import {parsePendingLesson,pendingLessonKey,validLessonCreationReceipt,type PendingLessonCreation} from "@/lib/course-session-pending";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { MAX_COURSE_SESSION_OCCURRENCES } from "@/lib/course-session-schedule";
import { needsSessionRosterRule } from "@/lib/course-session-roster-rules";
import {
  CalendarClock,
  CalendarOff,
  ChevronRight,
  CirclePlus,
  Clock3,
  Copy,
  DoorOpen,
  Loader2,
  MessageSquare,
  Network,
  Pencil,
  PlayCircle,
  Repeat2,
  RotateCcw,
  Save,
  Square,
  Users,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTimeZone } from "@/lib/use-time-zone";
import { SchedulingTimeZone, ScheduleTimePreview } from "@/components/time-zone-selector";
import { resolveEditedZonedInput, zonedInputValue } from "@/lib/time-zone";
import { useTranslation } from "@/lib/i18n/context";
import { usePortalFeedback } from "@/components/portal/portal-feedback";
import { LargeClassBreakoutManager } from "@/components/classroom/large-class-breakout-manager";
import { useTeacherSchedules } from "@/hooks/use-teacher-schedules";
import {
  TeacherSchedulePeek,
  teacherSchedulePeekStyles,
} from "@/components/scheduling/teacher-schedule-peek";
import styles from "./course-session-manager.module.css";
import { ClassTimingControls } from "@/components/classroom/class-timing-controls";
import { LimitedSessionEdit } from "./limited-session-edit";

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
  timezone?: string | null;
  id: string;
  title: string;
  position: number;
  roomType: number;
  status: string;
  startTime: string;
  endTime: string;
  endedAt: string | null;
  teacherMode: string;
  studentMode: string;
  leadTeacherId: string | null;
  leadTeacherName: string;
  seriesId: string | null;
  isDetached?: boolean;
  programId?: string | null;
  unitId?: string | null;
  teachers?: TeacherRule[];
  students?: StudentRule[];
  groupLinks?: GroupRule[];
  _count?: {
    teachers?: number;
    students?: number;
    attendances?: number;
    recordings?: number;
  };
  submissionSummary?: { leaveCount: number; requirementsCount: number };
  mySubmission?: StudentSubmissionSnapshot;
  viewerRole?: "teacher" | "assistant" | "student" | "observer";
  updatedAt?: string;
};

type StudentSubmissionSnapshot = {
  requirements: string;
  leaveStatus: "none" | "active" | "withdrawn";
  leaveReason: string;
  leaveRequestedAt: string | null;
  leaveWithdrawnAt: string | null;
  updatedAt: string | null;
};

type TeacherStudentSubmission = StudentSubmissionSnapshot & {
  studentId: string;
  studentName: string;
  studentAvatar: string;
};

type Props = {
  courseId: string;
  courseName: string;
  courseKind?: "series" | "standalone";
  roomType: number;
  canManage: boolean;
  canManageCourseLifecycle?: boolean;
  currentUserIds?: string[];
  leadTeacherId: string;
  teachers: Teacher[];
  students: Student[];
  groupLinks: Array<{ group: GroupNode }>;
  initialSessions?: CourseSessionItem[];
  onManageRoster: (role: "assistant" | "student") => void;
  onSessionsChanged?: () => void | Promise<void>;
  initialProgramId?: string | null;
  initialProgramName?: string;
  initialUnitId?: string | null;
  initialUnitName?: string;
  createOnOpen?: boolean;
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const ROOM_TYPES = [0, 4, 2, 10] as const;

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
  canManageCourseLifecycle = false,
  currentUserIds = [],
  leadTeacherId,
  teachers,
  students,
  groupLinks,
  initialSessions,
  onManageRoster,
  onSessionsChanged,
  initialProgramId = null,
  initialProgramName,
  initialUnitId = null,
  initialUnitName,
  createOnOpen = false,
}: Props) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { timeZone } = useTimeZone();
  const { notify, confirmAction } = usePortalFeedback();
  const [sessions, setSessions] = useState<CourseSessionItem[]>(initialSessions ?? []);
  const [loading, setLoading] = useState(initialSessions === undefined);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(createOnOpen);
  const creationRequest = useRef("");
  const creationPayload = useRef<string | null>(null);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const pendingKey=canManage&&currentUserIds[0]?pendingLessonKey(currentUserIds[0],courseId):"";
  const recoveryStorageUnavailable=useRef(!pendingKey);
  const [recovery,setRecovery]=useState<PendingLessonCreation|null>(null),[recoveryInvalid,setRecoveryInvalid]=useState(false),[recoveryScope,setRecoveryScope]=useState<string|null>(null),[recoveryBusy,setRecoveryBusy]=useState(false),[recoveryError,setRecoveryError]=useState("");
  const previousRecoveryKey=useRef(pendingKey);
  const recoveryReady=recoveryScope===pendingKey;
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;if(previousRecoveryKey.current!==pendingKey){previousRecoveryKey.current=pendingKey;creationPayload.current=null;creationRequest.current="";recoveryStorageUnavailable.current=!pendingKey;setCreationUncertain(false);setDialogOpen(false);}try{const raw=pendingKey?sessionStorage.getItem(pendingKey):null;const parsed=parsePendingLesson(raw);setRecovery(parsed);setRecoveryInvalid(Boolean(raw&&!parsed));}catch{recoveryStorageUnavailable.current=true;setRecovery(null);setRecoveryInvalid(false);}setRecoveryError("");setRecoveryScope(pendingKey);});return()=>{active=false;};},[pendingKey]);
  const clearSavedCreation=(requestId:string)=>{try{if(pendingKey&&parsePendingLesson(sessionStorage.getItem(pendingKey))?.requestId===requestId)sessionStorage.removeItem(pendingKey);}catch{/* Current-window state remains authoritative if storage is unavailable. */}};
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const detailSession = sessions.find((session) => session.id === detailSessionId);
  const [editingSession, setEditingSession] = useState<CourseSessionItem | null>(null);
  const [editVersions, setEditVersions] = useState<Record<string, string>>({});
  const [editSnapshot, setEditSnapshot] = useState<CourseSessionItem[]>([]);
  const [editConflict, setEditConflict] = useState(false);
  const [editScope, setEditScope] = useState<"this" | "future">("this");
  const [saving, setSaving] = useState(false);
  const [scheduleType, setScheduleType] = useState<"single" | "recurring">("single");
  const [initialStart] = useState(() => defaultStart());
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(() => zonedInputValue(initialStart, timeZone));
  const [duration, setDuration] = useState(60);
  const [timezone, setTimezone] = useState(timeZone);
  const [weekdays, setWeekdays] = useState<number[]>(() => [new Date(zonedInputValue(initialStart, timeZone).slice(0, 10) + "T12:00:00Z").getUTCDay()]);
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
  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null);
  const [enteringSessionId, setEnteringSessionId] = useState<string | null>(null);
  const [submissionSession, setSubmissionSession] = useState<CourseSessionItem | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [requirementsDraft, setRequirementsDraft] = useState("");
  const [leaveReasonDraft, setLeaveReasonDraft] = useState("");
  const [studentSubmission, setStudentSubmission] = useState<StudentSubmissionSnapshot | null>(null);
  const [teacherSubmissions, setTeacherSubmissions] = useState<TeacherStudentSubmission[]>([]);
  const [legacyStudentRemarks, setLegacyStudentRemarks] = useState("");
  const [submissionEditable, setSubmissionEditable] = useState(false);
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
      const payload = (await response.json().catch(() => ({}))) as {
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
    queueMicrotask(() => void loadSessions());
  }, [loadSessions]);

  const openSubmission = async (lesson: CourseSessionItem) => {
    setSubmissionSession(lesson);
    setSubmissionLoading(true);
    setSubmissionError("");
    setTeacherSubmissions([]);
    setLegacyStudentRemarks("");
    try {
      const response = await fetch(
        canManage
          ? `/api/sessions/${encodeURIComponent(lesson.id)}/student-submissions`
          : `/api/sessions/${encodeURIComponent(lesson.id)}/student-submission`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        editable?: boolean;
        submission?: StudentSubmissionSnapshot;
        submissions?: TeacherStudentSubmission[];
        legacyStudentRemarks?: string;
      };
      if (!response.ok) throw new Error(payload.error || t("courseSessions.submissionLoadFailed"));
      if (canManage) {
        setTeacherSubmissions(payload.submissions || []);
        setLegacyStudentRemarks(payload.legacyStudentRemarks || "");
      } else {
        const next = payload.submission || lesson.mySubmission || {
          requirements: "",
          leaveStatus: "none" as const,
          leaveReason: "",
          leaveRequestedAt: null,
          leaveWithdrawnAt: null,
          updatedAt: null,
        };
        setStudentSubmission(next);
        setRequirementsDraft(next.requirements);
        setLeaveReasonDraft(next.leaveReason);
        setSubmissionEditable(Boolean(payload.editable));
      }
    } catch (cause) {
      setSubmissionError(
        cause instanceof Error ? cause.message : t("courseSessions.submissionLoadFailed"),
      );
    } finally {
      setSubmissionLoading(false);
    }
  };

  const saveStudentSubmission = async (
    leaveAction?: "request" | "withdraw",
  ) => {
    if (!submissionSession || submissionSaving) return;
    setSubmissionSaving(true);
    setSubmissionError("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(submissionSession.id)}/student-submission`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requirements: requirementsDraft,
            ...(leaveAction ? { leaveAction, leaveReason: leaveReasonDraft } : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        submission?: StudentSubmissionSnapshot;
      };
      if (!response.ok || !payload.submission) {
        throw new Error(payload.error || t("courseSessions.submissionSaveFailed"));
      }
      setStudentSubmission(payload.submission);
      setLeaveReasonDraft(payload.submission.leaveReason);
      setSessions((current) =>
        current.map((item) =>
          item.id === submissionSession.id
            ? { ...item, mySubmission: payload.submission }
            : item,
        ),
      );
      notify(t("courseSessions.submissionSaved"), "success");
    } catch (cause) {
      setSubmissionError(
        cause instanceof Error ? cause.message : t("courseSessions.submissionSaveFailed"),
      );
    } finally {
      setSubmissionSaving(false);
    }
  };

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
    let start: Date;
    try { start = resolveEditedZonedInput(startTime, timezone, editingSession ? {instant:editingSession.startTime,timezone:editingSession.timezone || timeZone} : undefined); } catch { return { start: null, end: null }; }
    return {
      start,
      end: new Date(start.getTime() + duration * 60_000),
    };
  }, [duration, editingSession, startTime, timezone, timeZone]);

  const enterSession = async (sessionId: string) => {
    if (enteringSessionId) return;
    setEnteringSessionId(sessionId);
    let child: Window | null = null;
    let opened = false;
    try {
      child = reserveClassroomWindow();
      const result = await workspaceRequest<{ allowed?: boolean; classroomUrl?: string; reason?: string }>(classroomVerifyAccessPath(courseId, sessionId));
      if (!result.allowed || !result.classroomUrl) throw new Error(result.reason || t("classroom.launchError"));
      const target = new URL(result.classroomUrl, window.location.origin);
      opened = await openClassroomWindow(target, child);
      if (!opened) router.push(target.pathname + target.search);
    } catch (cause) {
      notify(cause instanceof Error && cause.name !== "AbortError" ? cause.message : t("classroom.launchError"), "error");
      void loadSessions();
    } finally {
      if (!opened) child?.close();
      setEnteringSessionId(null);
    }
  };

  const toggleId = (
    value: string,
    current: string[],
    update: (next: string[]) => void,
  ) => {
    update(current.includes(value) ? current.filter((id) => id !== value) : [...current, value]);
  };

  const openCreateDialog = () => {
    if(!recoveryReady)return;
    if(recovery||recoveryInvalid){setDialogOpen(true);return;}
    creationRequest.current = crypto.randomUUID();
    creationPayload.current = null;
    setCreationUncertain(false);
    const nextStart = defaultStart();
    setEditingSession(null);
    setEditConflict(false);
    setEditScope("this");
    setScheduleType("single");
    setTitle("");
    setTimezone(timeZone);
    setStartTime(zonedInputValue(nextStart, timeZone));
    setDuration(60);
    setWeekdays([new Date(zonedInputValue(nextStart, timeZone).slice(0, 10) + "T12:00:00Z").getUTCDay()]);
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

  useEffect(() => {
    const open = (event: Event) => {
      if (canCreateSession && !dialogOpen && (event as CustomEvent).detail === courseId) openCreateDialog();
    };
    window.addEventListener("classroom:quick-schedule", open);
    return () => window.removeEventListener("classroom:quick-schedule", open);
  });

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
    setEditSnapshot(sessions);
    setEditVersions(Object.fromEntries(sessions.filter(item => item.updatedAt).map(item => [item.id, item.updatedAt!] )));
    setEditConflict(false);
    setEditScope("this");
    setScheduleType("single");
    setTitle(session.title || "");
    setTimezone(session.timezone || timeZone);
    setStartTime(zonedInputValue(start, session.timezone || timeZone));
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
      const payload = (await response.json().catch(() => ({}))) as {
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
      const payload = (await response.json().catch(() => ({}))) as {
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
    if (editingSession && editConflict) return;
    let start: Date;
    try { start = resolveEditedZonedInput(startTime, timezone, editingSession ? {instant:editingSession.startTime,timezone:editingSession.timezone || timeZone} : undefined); } catch { setError(t("timeZones.invalid")); return; }
    if (duration < 10) {
      setError(t("courseSessions.invalidSchedule"));
      return;
    }
    if (!editingSession && scheduleType === "recurring" && (
      !Number.isInteger(occurrenceCount) || occurrenceCount < 1 ||
      occurrenceCount > MAX_COURSE_SESSION_OCCURRENCES
    )) {
      setError(t("courseSessions.invalidOccurrences", { max: MAX_COURSE_SESSION_OCCURRENCES }));
      return;
    }
    if (!selectedTeachers.includes(sessionLeadId)) {
      setError(t("courseSessions.leadRequired"));
      return;
    }
    const teacherRules = availableTeachers
      .filter((teacher) => needsSessionRosterRule(teacherMode, selectedTeachers.includes(teacher.teacherId), teachers.some((base) => casdoorUserIdsMatch(base.teacherId, teacher.teacherId))))
      .map((teacher) => ({
        userId: teacher.teacherId,
        displayName: teacher.teacherName,
        avatar: teacher.teacherAvatar || "",
        action: selectedTeachers.includes(teacher.teacherId) ? "include" : "exclude",
        role: teacher.teacherId === sessionLeadId ? "teacher" : "assistant",
      }));
    const studentRules = availableStudents
      .filter((student) => needsSessionRosterRule(studentMode, selectedStudents.includes(student.studentId), students.some((base) => casdoorUserIdsMatch(base.studentId, student.studentId))))
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
    const originalDuration=editingSession ? Math.max(10,Math.round((Date.parse(editingSession.endTime)-Date.parse(editingSession.startTime))/60_000)) : null;
    const end = editingSession && start.getTime()===Date.parse(editingSession.startTime) && duration===originalDuration ? new Date(editingSession.endTime) : new Date(start.getTime() + duration * 60_000);
    const schedule = scheduleType === "single"
      ? { type: "single", timezone, startTime: start.toISOString(), endTime: end.toISOString() }
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
    if (!editingSession && !creationRequest.current) creationRequest.current = crypto.randomUUID();
    let uncertain = false;
    try {
      const body = JSON.stringify({
        ...(!editingSession ? { programId: initialProgramId, unitId: initialUnitId } : {}),
        title: title.trim() || undefined, roomType: selectedRoomType,
        ...(editingSession ? {startTime:start.toISOString(),endTime:end.toISOString(),scope:editScope,timezone,expectedVersions:editVersions,
          expectedTargetIds:editScope === "future" && editingSession.seriesId
            ? editSnapshot.filter(item=>item.seriesId===editingSession.seriesId&&item.status==="scheduled"&&!item.isDetached&&Date.parse(item.startTime)>=Date.parse(editingSession.startTime)).map(item=>item.id)
            : [editingSession.id]} : {schedule}),
        teacherMode,studentMode,leadTeacherId:sessionLeadId,teachers:teacherRules,students:studentRules,groups:groupRules,
      });
      if (!editingSession && !creationPayload.current) creationPayload.current = body;
      if(!editingSession&&pendingKey){
        try{
          const raw=sessionStorage.getItem(pendingKey),saved=parsePendingLesson(raw);
          if(raw&&(!saved||saved.requestId!==creationRequest.current||saved.body!==creationPayload.current)){setRecovery(saved);setRecoveryInvalid(!saved);setError(locale.startsWith("zh")?"已有待确认的排课请求，请先处理。":"A lesson request is awaiting confirmation. Resolve it first.");return;}
          sessionStorage.setItem(pendingKey,JSON.stringify({requestId:creationRequest.current,body:creationPayload.current}));
          recoveryStorageUnavailable.current=false;
        }catch{recoveryStorageUnavailable.current=true;}
      }
      uncertain = !editingSession;
      const response = await fetch(
        editingSession
          ? `/api/courses/${courseId}/sessions/${editingSession.id}`
          : `/api/courses/${courseId}/sessions`,
        {
        method: editingSession ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(!editingSession ? { "Idempotency-Key": creationRequest.current } : {}) },
        body: editingSession ? body : creationPayload.current,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string;sessions?:{id?:unknown}[] };
      if (editingSession && response.status === 409) {
        setEditConflict(true);
        setError(locale.startsWith("zh") ? "课节或教学人员已变更。请刷新后重新编辑，以免覆盖其他人的修改。" : "The lesson or teaching team has changed. Refresh and edit again to avoid overwriting changes.");
        return;
      }
      if (!response.ok) {if(!creationUncertain&&response.status>=400&&response.status<500&&response.status!==408&&response.status!==429)uncertain=false;throw new Error(payload.error || t("courseSessions.createFailed"));}
      if (!editingSession && !validLessonCreationReceipt(payload,scheduleType==="single"?1:occurrenceCount)) throw new Error("Invalid creation receipt");
      uncertain = false;
      clearSavedCreation(creationRequest.current);
      creationPayload.current = null;
      setCreationUncertain(false);
      setDialogOpen(false);
      setEditingSession(null);
      setTitle("");
      await loadSessions();
      await onSessionsChanged?.();
    } catch (cause) {
      if(uncertain){setCreationUncertain(true);setError(locale.startsWith("zh")?(recoveryStorageUnavailable.current?"暂时无法确认创建结果。本地恢复不可用，请勿刷新并重试确认。":"暂时无法确认是否创建成功，请保持此窗口并重试确认。"):recoveryStorageUnavailable.current?"The result is unconfirmed and local recovery is unavailable. Do not reload; retry here.":"Could not confirm whether the lesson was created. Keep this window open and retry to confirm.");}
      else{if(!editingSession){clearSavedCreation(creationRequest.current);creationPayload.current=null;setCreationUncertain(false);}setError(cause instanceof Error ? cause.message : t("courseSessions.createFailed"));}
    } finally {
      setSaving(false);
    }
  };

  const copySessionLink = async (sessionId: string) => {
    try {
      const url = `${window.location.origin}/classroom?sessionId=${sessionId}`;
      if (!await copyInvitationText(url)) {
        window.prompt(t("courseDetail.copyFailed"), url);
        return;
      }
      notify(t("courseDetail.copySuccess"), "success");
    } catch {
      notify(t("courseDetail.copyFailed"), "error");
    }
  };

  const updateLifecycle = async (
    session: CourseSessionItem,
    action: "end" | "reopen" | "cancel" | "restore",
  ) => {
    const confirmationKey =
      action === "end"
        ? "courseSessions.endConfirm"
        : action === "reopen"
          ? "courseSessions.reopenConfirm"
          : action === "cancel"
            ? "courseSessions.cancelConfirm"
            : "courseSessions.restoreConfirm";
    if (
      !(await confirmAction({
        description: t(confirmationKey, { title: session.title }),
        tone: action === "end" || action === "cancel" ? "danger" : "default",
      }))
    ) return;
    setLifecycleBusy(session.id);
    setError("");
    try {
      const response = await fetch(
        `/api/courses/${courseId}/sessions/${session.id}/lifecycle`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || t("courseSessions.lifecycleFailed"));
      }
      await loadSessions();
      await onSessionsChanged?.();
      router.refresh();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : t("courseSessions.lifecycleFailed");
      setError(message);
      notify(message, "error");
    } finally {
      setLifecycleBusy(null);
    }
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const breakoutLeadTeacherId =
    sessions.find((session) => session.id === breakoutSessionId)?.leadTeacherId ||
    leadTeacherId;
  const canManageBreakout =
    canManage &&
    currentUserIds.some((candidate) =>
      casdoorUserIdsMatch(breakoutLeadTeacherId, candidate),
    );

  const retryRecovery=async()=>{
    if(!recovery||!recoveryReady||recoveryBusy||!canManage)return;
    setRecoveryBusy(true);setRecoveryError("");
    try{
      const response=await fetch(`/api/courses/${encodeURIComponent(courseId)}/sessions`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Idempotency-Key":recovery.requestId},body:recovery.body});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!validLessonCreationReceipt(payload,recovery.expectedCount))throw new Error("Unconfirmed");
      clearSavedCreation(recovery.requestId);setRecovery(null);setDialogOpen(false);await loadSessions();await onSessionsChanged?.();
    }catch{setRecoveryError(locale.startsWith("zh")?"仍无法确认结果，请稍后重试；也可先检查课节列表。":"The result is still unconfirmed. Retry later or check the lesson list.");}
    finally{setRecoveryBusy(false);}
  };
  const discardRecovery=()=>{
    if(recoveryBusy||!window.confirm(locale.startsWith("zh")?"课节可能已经创建。放弃恢复前请先检查课节列表，避免重复创建。确定放弃吗？":"The lesson may already exist. Check the lesson list before discarding recovery. Discard anyway?"))return;
    try{if(pendingKey)sessionStorage.removeItem(pendingKey);}catch{/* Storage may be unavailable. */}
    setRecovery(null);setRecoveryInvalid(false);setRecoveryError("");setDialogOpen(false);
  };
  const closeCreationDialog=()=>{
    if(saving||recoveryBusy)return;
    if(creationUncertain){
      if(!window.confirm(locale.startsWith("zh")?"课节可能已经创建。待确认请求会保留在当前窗口，可稍后重试。关闭吗？":"The lesson may already exist. The pending request remains available in this window. Close?"))return;
      setRecovery(parsePendingLesson(JSON.stringify({requestId:creationRequest.current,body:creationPayload.current})));
    }
    creationPayload.current=null;setCreationUncertain(false);setDialogOpen(false);
  };

  return (
    <section className={styles.manager}>
      <header className={styles.header}>
        <div>
          <span>{t("courseSessions.eyebrow")}</span>
          <h2>{t("courseSessions.title")}</h2>
          <p>{t("courseSessions.description")}</p>
        </div>
        {canCreateSession ? (
          <button className={styles.createButton} type="button" disabled={!recoveryReady} onClick={openCreateDialog}>
            <CirclePlus className="h-4 w-4" />
            {t("courseSessions.schedule")}
          </button>
        ) : null}
      </header>

      {recoveryReady&&(recovery||recoveryInvalid)&&<div className={styles.error} role="status">{locale.startsWith("zh")?"有待确认的排课请求。":"A lesson request is awaiting confirmation."} <button type="button" onClick={()=>setDialogOpen(true)}>{locale.startsWith("zh")?"查看并恢复":"Review and recover"}</button></div>}

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? (
        <div className={styles.loading}><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>
      ) : sessions.length === 0 ? (
        canCreateSession ? (
        <button className={styles.empty} type="button" onClick={openCreateDialog}>
          <CalendarClock />
          <strong>{t("courseSessions.empty")}</strong>
          <span>{t(isStandalone ? "courseSessions.standaloneEmptyHint" : "courseSessions.emptyHint")}</span>
        </button>
        ) : (
          <div className={styles.empty} role="status">
            <CalendarClock />
            <strong>{t("courseSessions.empty")}</strong>
            <span>{t(isStandalone ? "courseSessions.standaloneEmptyHint" : "courseSessions.emptyHint")}</span>
          </div>
        )
      ) : (
        <div className={styles.timeline}>
          {sessions.map((session) => {
            const effectiveStatus =
              session.endedAt && session.status !== "cancelled"
                ? "finished"
                : session.status;
            const isLive = effectiveStatus === "live" || effectiveStatus === "afterClass";
            const canEnter = !["cancelled", "finished"].includes(effectiveStatus);
            const canManageLifecycle =
              canManageCourseLifecycle ||
              session.viewerRole === "teacher" ||
              Boolean(
                session.leadTeacherId &&
                  currentUserIds.some((candidate) =>
                    casdoorUserIdsMatch(session.leadTeacherId!, candidate),
                  ),
              );
            return (
              <article className={styles.sessionRow} key={session.id}>
                <div className={styles.rail}>
                  <span className={`${styles.dot} ${statusTone(effectiveStatus)}`} />
                </div>
                <time>
                  <strong>{formatDate(session.startTime)}</strong>
                  <span>{Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60_000)} {t("courseSessions.minutes")}</span>
                </time>
                <div className={styles.sessionMain}>
                  <div className={styles.sessionTitle}>
                    <h3>{session.title || `${courseName} · ${session.position}`}</h3>
                    <span className={`${styles.status} ${statusTone(effectiveStatus)}`}>
                      {t(`courseSessions.status.${effectiveStatus}`)}
                    </span>
                    {session.seriesId ? <Repeat2 className="h-3.5 w-3.5" /> : null}
                  </div>
                  <div className={styles.metadata}>
                    <span className={styles.avatar}>{initials(session.leadTeacherName)}</span>
                    <span>{session.leadTeacherName}</span>
                    <span title={t(session.studentMode === "inherit" ? "courseSessions.studentRosterCourseHint" : "courseSessions.studentRosterCustomHint")}><Users className="h-3.5 w-3.5" />{session.studentMode === "inherit" ? t("courseSessions.inheritsStudents") : t("courseSessions.customStudents")}</span>
                    {session._count?.recordings ? <span>{session._count.recordings} {t("courseSessions.recordings")}</span> : null}
                    {canManage && session.submissionSummary?.leaveCount ? (
                      <button type="button" className={styles.signalButton} onClick={() => void openSubmission(session)}>
                        <CalendarOff className="h-3.5 w-3.5" />
                        {t("courseSessions.leaveCount", { count: session.submissionSummary.leaveCount })}
                      </button>
                    ) : null}
                    {canManage && session.submissionSummary?.requirementsCount ? (
                      <button type="button" className={styles.signalButton} onClick={() => void openSubmission(session)}>
                        <MessageSquare className="h-3.5 w-3.5" />
                        {t("courseSessions.requirementsCount", { count: session.submissionSummary.requirementsCount })}
                      </button>
                    ) : null}
                  </div>
                  {!canManage && session.viewerRole !== "teacher" && session.viewerRole !== "assistant" ? (
                    <div className={styles.studentActions}>
                      <button type="button" onClick={() => void openSubmission(session)}>
                        <MessageSquare className="h-3.5 w-3.5" />
                        {session.mySubmission?.requirements
                          ? t("courseSessions.editRequirements")
                          : t("courseSessions.addRequirements")}
                      </button>
                      <button
                        type="button"
                        data-active={session.mySubmission?.leaveStatus === "active"}
                        onClick={() => void openSubmission(session)}
                      >
                        <CalendarOff className="h-3.5 w-3.5" />
                        {session.mySubmission?.leaveStatus === "active"
                          ? t("courseSessions.leaveActive")
                          : t("courseSessions.requestLeave")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className={styles.rowActions}>
                  {canManage && session.status === "scheduled" ? (
                    <button type="button" onClick={() => openEditDialog(session)} title={t("common.edit")}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                  {!canManage && session.viewerRole === "teacher" && session.status === "scheduled" && !session.endedAt && session.updatedAt ? <LimitedSessionEdit courseId={courseId} lesson={session} onSaved={() => { void loadSessions(); void onSessionsChanged?.(); }} /> : null}
                  {session.roomType === 2 && canManage && canEnter ? (
                    <button type="button" onClick={() => setBreakoutSessionId(breakoutSessionId === session.id ? null : session.id)} title={t("courseSessions.breakouts")}>
                      <Network className="h-4 w-4" />
                    </button>
                  ) : null}
                  {canManage ? (
                    <button type="button" onClick={() => void copySessionLink(session.id)} title={t("courseSessions.copyLink")} aria-label={t("courseSessions.copyLink")}>
                      <Copy className="h-4 w-4" />
                    </button>
                  ) : null}
                  {canManageLifecycle && isLive ? (
                    <button
                      type="button"
                      className={styles.endAction}
                      disabled={lifecycleBusy === session.id}
                      onClick={() => void updateLifecycle(session, "end")}
                      title={t("courseSessions.end")}
                    >
                      {lifecycleBusy === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                  {canManageLifecycle && effectiveStatus === "scheduled" ? (
                    <button
                      type="button"
                      className={styles.endAction}
                      disabled={lifecycleBusy === session.id}
                      onClick={() => void updateLifecycle(session, "cancel")}
                      title={t("courseSessions.cancelSession")}
                    >
                      {lifecycleBusy === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </button>
                  ) : null}
                  {canManageLifecycle && effectiveStatus === "cancelled" ? (
                    <button
                      type="button"
                      disabled={lifecycleBusy === session.id}
                      onClick={() => void updateLifecycle(session, "restore")}
                      title={t("courseSessions.restore")}
                    >
                      {lifecycleBusy === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    </button>
                  ) : null}
                  {canManageLifecycle && isLive && <ClassTimingControls compact courseId={courseId} sessionId={session.id} ended={false} onExtended={() => { void loadSessions(); router.refresh(); }} />}
                  {canManageLifecycle && effectiveStatus === "finished" ? (
                    <button
                      type="button"
                      disabled={lifecycleBusy === session.id}
                      onClick={() => void updateLifecycle(session, "reopen")}
                      title={t("courseSessions.reopen")}
                    >
                      {lifecycleBusy === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                  {(session._count?.recordings || 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/courses/${encodeURIComponent(courseId)}/playback?sessionId=${encodeURIComponent(session.id)}`)}
                      title={t("studentDashboard.viewPlayback")}
                    >
                      <PlayCircle className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    className={styles.detailsButton}
                    type="button"
                    onClick={() => setDetailSessionId(session.id)}
                    aria-label={`${t("portal.details")} · ${session.title || `${courseName} · ${session.position}`}`}
                  >
                    {t("portal.details")}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  {canEnter ? (
                    <button
                      className={styles.enterButton}
                      type="button"
                      disabled={Boolean(enteringSessionId)}
                      onClick={() => void enterSession(session.id)}
                    >
                      {enteringSessionId === session.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("teacherDashboard.btnEntering")}
                        </>
                      ) : (
                        <>
                          {isLive ? t("courseSessions.enterLive") : t("courseSessions.enter")}
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
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
            canManage={canManageBreakout}
            leadTeacherId={leadTeacherId}
            teachers={teachers}
            students={students}
            groupLinks={groupLinks}
            onManageRoster={onManageRoster}
          />
        </div>
      ) : null}

      <Dialog open={Boolean(detailSession)} onOpenChange={(open) => { if (!open) setDetailSessionId(null); }}>
        <DialogContent className={styles.submissionDialog}>
          {detailSession ? (
            <>
              <header className={styles.dialogHeader}>
                <span>{t("courseSessions.detailsTitle")}</span>
                <DialogTitle>{detailSession.title || `${courseName} · ${detailSession.position}`}</DialogTitle>
                <DialogDescription>{courseName}</DialogDescription>
              </header>
              <dl className={styles.detailGrid}>
                <div><dt>{t("courseSessions.statusLabel")}</dt><dd>{t(`courseSessions.status.${detailSession.endedAt && detailSession.status !== "cancelled" ? "finished" : detailSession.status}`)}</dd></div>
                <div><dt>{t("courseSessions.roomType")}</dt><dd>{t(({ 0: "common.roomType1v1", 4: "common.roomTypeSmall", 2: "common.roomTypeBig", 10: "common.roomTypePublic" } as Record<number, string>)[detailSession.roomType] || "common.unknown")}</dd></div>
                <div><dt>{t("courseSessions.startTime")}</dt><dd>{formatDate(detailSession.startTime)}</dd></div>
                <div><dt>{t("courseSessions.endTime")}</dt><dd>{formatDate(detailSession.endTime)}</dd></div>
                <div><dt>{t("common.lead")}</dt><dd>{detailSession.leadTeacherName || t("common.unknown")}</dd></div>
                <div><dt>{t("courseSessions.duration")}</dt><dd>{Math.round((new Date(detailSession.endTime).getTime() - new Date(detailSession.startTime).getTime()) / 60_000)} {t("courseSessions.minutes")}</dd></div>
                <div><dt>{t("courseSessions.teachers")}</dt><dd>{t(detailSession.teacherMode === "inherit" ? "courseSessions.inherit" : "courseSessions.custom")}</dd></div>
                <div><dt>{t("courseSessions.students")}</dt><dd>{t(detailSession.studentMode === "inherit" ? "courseSessions.inheritsStudents" : "courseSessions.customStudents")}</dd></div>
                <div><dt>{t("studentDashboard.viewPlayback")}</dt><dd>{detailSession._count?.recordings || 0} {t("courseSessions.recordings")}</dd></div>
              </dl>
              <footer className={styles.dialogFooter}>
                <button type="button" onClick={() => setDetailSessionId(null)}>{t("common.dismiss")}</button>
                {canManage && detailSession.status === "scheduled" && !detailSession.endedAt ? (
                  <button type="button" onClick={() => { setDetailSessionId(null); openEditDialog(detailSession); }}><Pencil className="h-4 w-4" />{t("courseSessions.editTitle")}</button>
                ) : null}
              </footer>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={(open)=>{if(open)setDialogOpen(true);else closeCreationDialog();}}>
        <DialogContent className={styles.dialog}>
          <header className={styles.dialogHeader}>
            <span>{t("courseSessions.scheduleEyebrow")}</span>
            <DialogTitle>{editingSession ? t("courseSessions.editTitle") : t("courseSessions.scheduleTitle")}</DialogTitle>
            <DialogDescription>{t("courseSessions.scheduleHint")}</DialogDescription>
          </header>
          {!recoveryReady?<p role="status">{t("common.loading")}</p>:recovery||recoveryInvalid?<>
            <p>{recoveryInvalid?(locale.startsWith("zh")?"待确认记录无法读取，请先检查课节列表。":"The pending record cannot be read. Check the lesson list first."):(locale.startsWith("zh")?`待确认课节：${recovery?.title||"未命名"}`:`Pending lesson: ${recovery?.title||"Untitled"}`)}</p>
            {recoveryError&&<div role="alert" className={styles.error}>{recoveryError}</div>}
            <footer className={styles.dialogFooter}><button type="button" disabled={recoveryBusy} onClick={discardRecovery}>{locale.startsWith("zh")?"放弃恢复":"Discard recovery"}</button>{recovery&&<button type="button" disabled={recoveryBusy} onClick={()=>void retryRecovery()}>{recoveryBusy?t("common.loading"):(locale.startsWith("zh")?"重试确认":"Retry confirmation")}</button>}</footer>
          </>:<>
          <fieldset disabled={saving||creationUncertain} style={{border:0,margin:0,padding:0,minWidth:0}}>
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
            {!editingSession && initialProgramName && <p className={styles.full}>{locale.startsWith("zh") ? "所属课程" : "Course"}: {initialProgramName}{initialUnitName ? ` / ${initialUnitName}` : ""}</p>}
            <label className={styles.full}><span>{t("courseSessions.sessionTitle")}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("courseSessions.titlePlaceholder")} /></label>
            <div className="time-zone-session-row"><SchedulingTimeZone value={timezone} onChange={setTimezone} localValue={startTime} /></div>
            <label><span>{t("courseSessions.startTime")}</span><input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label><span>{t("courseSessions.duration")}</span><input type="number" min={10} max={720} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
            <div className="time-zone-session-conversion"><ScheduleTimePreview value={startTime} timeZone={timezone} knownInstant={editingSession && (editingSession.timezone || timeZone)===timezone ? editingSession.startTime : undefined} /></div>
            <label><span>{t("courseSessions.roomType")}</span><select value={selectedRoomType} onChange={(event) => setSelectedRoomType(Number(event.target.value))}>{ROOM_TYPES.map((value) => <option value={value} key={value}>{t(value === 0 ? "common.roomType1v1" : value === 4 ? "common.roomTypeSmall" : value === 2 ? "common.roomTypeBig" : "common.roomTypePublic")}</option>)}</select></label>
            {!editingSession && scheduleType === "recurring" ? (
              <>
                <label>
                  <span>{t("courseSessions.occurrences")}</span>
                  <input type="number" min={1} max={MAX_COURSE_SESSION_OCCURRENCES} step={1} aria-describedby="course-session-occurrences-hint" value={occurrenceCount} onChange={(event) => setOccurrenceCount(Number(event.target.value))} />
                  <small id="course-session-occurrences-hint" className={styles.rosterHint}>{t("courseSessions.occurrencesHint", { max: MAX_COURSE_SESSION_OCCURRENCES })}</small>
                </label>
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
              <p className={styles.rosterHint}>
                {t(studentMode === "inherit" ? "courseSessions.studentRosterCourseHint" : "courseSessions.studentRosterCustomHint")}
              </p>
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
          </fieldset>
          {error ? <div role="alert" className={styles.error}>{error}</div> : null}
          <footer className={styles.dialogFooter}>
            <button type="button" disabled={saving} onClick={closeCreationDialog}>{t("common.cancel")}</button>
            {editConflict && <button type="button" onClick={() => { setDialogOpen(false); setEditingSession(null); void loadSessions(); void onSessionsChanged?.(); }}>{locale.startsWith("zh") ? "刷新课节" : "Refresh lessons"}</button>}
            <button type="button" disabled={saving || editConflict} onClick={() => void submit()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}{creationUncertain?(locale.startsWith("zh")?"重试确认":"Retry confirmation"):editingSession ? t("common.save") : scheduleType === "recurring" ? t("courseSessions.createSeries") : t("courseSessions.create")}</button>
          </footer>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(submissionSession)}
        onOpenChange={(open) => {
          if (!open && !submissionSaving) setSubmissionSession(null);
        }}
      >
        <DialogContent className={styles.submissionDialog}>
          <header className={styles.dialogHeader}>
            <span>{t("courseSessions.studentRequests")}</span>
            <h2>{submissionSession?.title}</h2>
            <p>
              {canManage
                ? t("courseSessions.teacherSubmissionHint")
                : t("courseSessions.studentSubmissionHint")}
            </p>
          </header>
          {submissionLoading ? (
            <div className={styles.loading} role="status">
              <Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}
            </div>
          ) : submissionError ? (
            <div className={styles.submissionError} role="alert">{submissionError}</div>
          ) : canManage ? (
            <div className={styles.submissionList}>
              {teacherSubmissions.some(
                (item) => item.leaveStatus === "active" || item.requirements,
              ) ? (
                teacherSubmissions
                  .filter((item) => item.leaveStatus === "active" || item.requirements)
                  .map((item) => (
                    <article key={item.studentId}>
                      <div className={styles.submissionPerson}>
                        <span className={styles.avatar}>{initials(item.studentName)}</span>
                        <strong>{item.studentName || item.studentId}</strong>
                        {item.leaveStatus === "active" ? (
                          <span className={styles.leaveBadge}>{t("courseSessions.leaveActive")}</span>
                        ) : null}
                      </div>
                      {item.leaveReason ? (
                        <p><b>{t("courseSessions.leaveReason")}</b>{item.leaveReason}</p>
                      ) : null}
                      {item.requirements ? (
                        <p><b>{t("courseSessions.requirementsLabel")}</b>{item.requirements}</p>
                      ) : null}
                    </article>
                  ))
              ) : (
                <div className={styles.submissionEmpty}>{t("courseSessions.noStudentSubmissions")}</div>
              )}
              {legacyStudentRemarks ? (
                <aside className={styles.legacyNote}>
                  <strong>{t("courseSessions.legacyRemarks")}</strong>
                  <p>{legacyStudentRemarks}</p>
                </aside>
              ) : null}
            </div>
          ) : (
            <div className={styles.submissionForm}>
              {!submissionEditable ? (
                <div className={styles.closedNotice}>{t("courseSessions.submissionClosed")}</div>
              ) : null}
              <label>
                <span>{t("courseSessions.requirementsLabel")}</span>
                <textarea
                  value={requirementsDraft}
                  maxLength={1000}
                  disabled={!submissionEditable || submissionSaving}
                  onChange={(event) => setRequirementsDraft(event.target.value)}
                  placeholder={t("courseSessions.requirementsPlaceholder")}
                />
                <small>{requirementsDraft.length}/1000</small>
              </label>
              <label>
                <span>{t("courseSessions.leaveReasonOptional")}</span>
                <textarea
                  value={leaveReasonDraft}
                  maxLength={500}
                  disabled={!submissionEditable || submissionSaving}
                  onChange={(event) => setLeaveReasonDraft(event.target.value)}
                  placeholder={t("courseSessions.leaveReasonPlaceholder")}
                />
                <small>{leaveReasonDraft.length}/500</small>
              </label>
              {submissionEditable ? (
                <footer className={styles.submissionFooter}>
                  {studentSubmission?.leaveStatus === "active" ? (
                    <button type="button" disabled={submissionSaving} onClick={() => void saveStudentSubmission("withdraw")}>
                      {t("courseSessions.withdrawLeave")}
                    </button>
                  ) : (
                    <button type="button" disabled={submissionSaving} onClick={() => void saveStudentSubmission("request")}>
                      <CalendarOff className="h-4 w-4" />{t("courseSessions.requestLeave")}
                    </button>
                  )}
                  <button type="button" disabled={submissionSaving} onClick={() => void saveStudentSubmission()}>
                    {submissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t("courseSessions.saveRequirements")}
                  </button>
                </footer>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
