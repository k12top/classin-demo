"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Calendar as CalendarIcon, CheckCircle2, Users, LogOut, ChevronLeft, ChevronRight, PlayCircle, Search, Trash2, UserPlus, Info, Clock, Globe, Key, Loader2, User, BookOpen, RefreshCw, Sparkles } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import {
  CourseStatusSelect,
  getCourseStatusLabel,
} from "@/components/CourseStatusSelect";
import { canEnterClassroom } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import { getPlaybackTarget } from "@/lib/playback-url";
import {
  addMinutesToLocalValue,
  COURSE_DURATION_PRESETS,
  DEFAULT_COURSE_DURATION_MINUTES,
  durationBetweenLocalValues,
  formatCourseDuration,
  normalizeCourseDuration,
} from "@/lib/course-schedule";
import {
  getTeacherDirectory,
  type TeacherDirectoryEntry,
} from "@/lib/teacher-directory-client";
import {
  PortalShell,
  type PortalPage,
} from "@/components/portal/portal-shell";
import {
  PortalCourseLibrary,
  PortalDashboardHero,
  PortalSectionHeader,
} from "@/components/portal/portal-dashboard";
import { usePortalFeedback } from "@/components/portal/portal-feedback";
import createCourseStyles from "@/components/portal/create-course-dialog.module.css";
import scheduleStyles from "@/components/portal/teacher-schedule.module.css";

interface Course {
  id: string;
  name: string;
  description: string;
  roomType: number;
  passcode?: string | null;
  ownerId?: string;
  ownerName?: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  teachers?: CourseTeacherSummary[];
  isCourseOwner?: boolean;
  canTeach?: boolean;
  joinedAs?: "teacher" | "student";
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  recordUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  students?: { studentId: string; studentName: string; studentAvatar?: string }[];
  groupLinks?: {
    id: string;
    group: {
      id: string;
      name: string;
      members?: { userId: string; userName?: string; userAvatar?: string }[];
    };
  }[];
  activeJoinLinks?: { id: string; label: string; joinUrl: string; useCount: number }[];
  activeCourseShareLinks?: { id: string; label: string; courseShareUrl: string; useCount: number }[];
}

interface CourseTeacherSummary {
  id?: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
}

type UserSearchResult = TeacherDirectoryEntry;

interface TeacherUser {
  userId: string;
  name?: string;
  displayName?: string;
  avatar?: string;
  email?: string;
  role?: string;
}

interface GroupNode {
  id: string;
  name: string;
  members: { userId: string; userName?: string; userAvatar?: string }[];
  children?: GroupNode[];
}

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
  10: "common.roomTypePublic",
};

type SidebarPage = "schedule" | "courses" | "students" | "settings";

interface TimezoneConfig {
  id: string;
  nameEN: string;
  timezone: string;
  flag: string;
  offset: string;
}

const SUPPORTED_TIMEZONES: TimezoneConfig[] = [
  { id: "SG", nameEN: "Singapore", timezone: "Asia/Singapore", flag: "🇸🇬", offset: "UTC+8" },
  { id: "MY", nameEN: "Malaysia", timezone: "Asia/Kuala_Lumpur", flag: "🇲🇾", offset: "UTC+8" },
  { id: "PH", nameEN: "Philippines", timezone: "Asia/Manila", flag: "🇵🇭", offset: "UTC+8" },
  { id: "TH", nameEN: "Thailand", timezone: "Asia/Bangkok", flag: "🇹🇭", offset: "UTC+7" },
  { id: "VN", nameEN: "Vietnam", timezone: "Asia/Ho_Chi_Minh", flag: "🇻🇳", offset: "UTC+7" },
  { id: "ID_WIB", nameEN: "Indonesia (Jakarta)", timezone: "Asia/Jakarta", flag: "🇮🇩", offset: "UTC+7" },
  { id: "ID_WITA", nameEN: "Indonesia (Bali)", timezone: "Asia/Makassar", flag: "🇮🇩", offset: "UTC+8" },
  { id: "LA", nameEN: "Laos", timezone: "Asia/Vientiane", flag: "🇱🇦", offset: "UTC+7" },
  { id: "KH", nameEN: "Cambodia", timezone: "Asia/Phnom_Penh", flag: "🇰🇭", offset: "UTC+7" },
  { id: "MM", nameEN: "Myanmar", timezone: "Asia/Yangon", flag: "🇲🇲", offset: "UTC+6:30" },
  { id: "CN", nameEN: "China (Beijing)", timezone: "Asia/Shanghai", flag: "🇨🇳", offset: "UTC+8" },
  { id: "JP", nameEN: "Japan", timezone: "Asia/Tokyo", flag: "🇯🇵", offset: "UTC+9" },
  { id: "KR", nameEN: "South Korea", timezone: "Asia/Seoul", flag: "🇰🇷", offset: "UTC+9" },
  { id: "US_EST", nameEN: "US (Eastern)", timezone: "America/New_York", flag: "🇺🇸", offset: "UTC-5" },
  { id: "US_PST", nameEN: "US (Pacific)", timezone: "America/Los_Angeles", flag: "🇺🇸", offset: "UTC-8" },
  { id: "UK", nameEN: "United Kingdom", timezone: "Europe/London", flag: "🇬🇧", offset: "UTC+0" },
  { id: "FR", nameEN: "France (Paris)", timezone: "Europe/Paris", flag: "🇫🇷", offset: "UTC+1" },
  { id: "DE", nameEN: "Germany (Berlin)", timezone: "Europe/Berlin", flag: "🇩🇪", offset: "UTC+1" }
];

const DEFAULT_TIMEZONE_IDS = ["TH", "VN", "SG", "ID_WIB"];
const CREATE_SUBMIT_DEBOUNCE_MS = 1200;

function timezoneDisplayName(timezone: TimezoneConfig, locale: string) {
  const regionCode = timezone.id.startsWith("ID_")
    ? "ID"
    : timezone.id.startsWith("US_")
      ? "US"
      : timezone.id === "UK"
        ? "GB"
        : timezone.id;
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(regionCode) ||
      timezone.nameEN
    );
  } catch {
    return timezone.nameEN;
  }
}

export default function TeacherDashboard({ courses, user, fetchCourses }: { courses: Course[], user: TeacherUser, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("schedule");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    const requestedPage = new URLSearchParams(window.location.search).get("view");
    if (
      requestedPage === "schedule" ||
      requestedPage === "courses" ||
      requestedPage === "students" ||
      requestedPage === "settings"
    ) {
      queueMicrotask(() => setActivePage(requestedPage));
    }
  }, []);
  const [enteringCourseId, setEnteringCourseId] = useState<string | null>(null);
  const [statusUpdatingCourseId, setStatusUpdatingCourseId] = useState<string | null>(null);
  const { t, locale } = useTranslation();
  const { notify, confirmAction } = usePortalFeedback();

  // Create course dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createRoomType, setCreateRoomType] = useState(0);
  const [createRequirePasscode, setCreateRequirePasscode] = useState(true);
  const [createPasscode, setCreatePasscode] = useState("");
  const [createStartTime, setCreateStartTime] = useState("");
  const [createEndTime, setCreateEndTime] = useState("");
  const [createDurationMinutes, setCreateDurationMinutes] = useState(
    DEFAULT_COURSE_DURATION_MINUTES,
  );
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createTeacherResults, setCreateTeacherResults] = useState<UserSearchResult[]>([]);
  const [createTeacherSearching, setCreateTeacherSearching] = useState(false);
  const [createTeacherError, setCreateTeacherError] = useState("");
  const [createTeachers, setCreateTeachers] = useState<CourseTeacherSummary[]>([]);
  const [createPrimaryTeacherId, setCreatePrimaryTeacherId] = useState("");
  const createLockRef = useRef(false);
  const lastCreateSubmitAtRef = useRef(0);

  const currentTeacher = useMemo<CourseTeacherSummary>(
    () => ({
      teacherId: user.userId,
      teacherName: user.displayName || user.name || user.userId,
      teacherAvatar: user.avatar || "",
    }),
    [user.avatar, user.displayName, user.name, user.userId]
  );

  const resetCreateTeacherSelection = useCallback(() => {
    setCreateTeachers([currentTeacher]);
    setCreatePrimaryTeacherId(currentTeacher.teacherId);
    setCreateTeacherError("");
  }, [currentTeacher]);

  const minDateTime = (() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  })();

  // Timezone conversion state
  const [selectedTzIds, setSelectedTzIds] = useState<string[]>([]);
  const [showTzConfig, setShowTzConfig] = useState(false);

  // Load selected timezones on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      queueMicrotask(() => {
        const saved = localStorage.getItem("classroom_selected_timezones");
        if (saved) {
          try {
            setSelectedTzIds(JSON.parse(saved));
          } catch {
            setSelectedTzIds(DEFAULT_TIMEZONE_IDS);
          }
        } else {
          setSelectedTzIds(DEFAULT_TIMEZONE_IDS);
        }
      });
    }
  }, []);

  // Save selected timezones when changed
  const handleTzToggle = (id: string) => {
    setSelectedTzIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("classroom_selected_timezones", JSON.stringify(next));
      return next;
    });
  };

  // Convert createStartTime to target countries' times
  const convertedTimes = useMemo(() => {
    if (!createStartTime) return [];
    const localDate = new Date(createStartTime);
    if (isNaN(localDate.getTime())) return [];

    return SUPPORTED_TIMEZONES
      .filter((tz) => selectedTzIds.includes(tz.id))
      .map((tz) => {
        try {
          const formatted = localDate.toLocaleString(locale, {
            timeZone: tz.timezone,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          return {
            ...tz,
            convertedTime: formatted,
          };
        } catch (e) {
          console.error(`Failed to format timezone ${tz.timezone}:`, e);
          return {
            ...tz,
            convertedTime: "Error",
          };
        }
      });
  }, [createStartTime, selectedTzIds, locale]);

  // Student management state
  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; displayName: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");

  const roomTypes = useMemo(() => [
    { value: 0, label: t("common.roomType1v1"), desc: t("teacherDashboard.roomDesc1v1"), icon: User },
    { value: 4, label: t("common.roomTypeSmall"), desc: t("teacherDashboard.roomDescSmall"), icon: Users },
    { value: 2, label: t("common.roomTypeBig"), desc: t("teacherDashboard.roomDescBig"), icon: BookOpen },
    { value: 10, label: t("common.roomTypePublic"), desc: t("teacherDashboard.roomDescPublic"), icon: Key },
  ], [t]);
  const selectedCreateRoomType =
    roomTypes.find((roomType) => roomType.value === createRoomType) ??
    roomTypes[0];
  const createRequiredFieldCount = [
    createName.trim(),
    createStartTime,
    createEndTime,
  ].filter(Boolean).length;
  const createCompletionPercent = Math.round(
    (createRequiredFieldCount / 3) * 100
  );
  const createSchedulePreview = createStartTime
    ? new Date(createStartTime).toLocaleString(
        locale,
        {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      )
    : t("teacherDashboard.schedulePending");

  const fetchMyGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  useEffect(() => {
    if (activePage === "students") {
      queueMicrotask(() => {
        void fetchMyGroups();
      });
    }
  }, [activePage, fetchMyGroups]);

  const handleStatusChange = async (courseId: string, status: string) => {
    const statusLabel = getCourseStatusLabel(t, status);
    if (
      !(await confirmAction({
        title: statusLabel,
        description: t("teacherDashboard.confirmFinishCancel", {
          status: statusLabel,
        }),
        tone: "danger",
      }))
    ) return;
    setStatusUpdatingCourseId(courseId);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchCourses();
      } else {
        notify(data.error || t("common.failed"), "error");
      }
    } catch (err) {
      console.error(err);
      notify(t("common.failed"), "error");
    } finally {
      setStatusUpdatingCourseId(null);
    }
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const selectedCourses = useMemo(() => {
    return courses
      .filter((c) => {
        if (!c.startTime) return false;
        return isSameDay(new Date(c.startTime), selectedDate);
      })
      .sort(
        (a, b) =>
          new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime()
      );
  }, [courses, selectedDate]);

  const coursesMissingStartTime = useMemo(
    () => courses.filter((c) => !c.startTime),
    [courses]
  );

  const shiftCalendarMonth = (delta: number) => {
    setSelectedDate((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth() + delta;
      const day = prev.getDate();
      const lastDayOfTargetMonth = new Date(y, m + 1, 0).getDate();
      return new Date(y, m, Math.min(day, lastDayOfTargetMonth));
    });
  };

  const handleEnterClassroomFromList = async (course: Course) => {
    if (!canEnterClassroom(course.status)) return;
    setEnteringCourseId(course.id);
    try {
      const res = await fetch(`/api/courses/${course.id}/verify-access`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.allowed) {
        notify(data.reason || t("classroom.launchError"), "error");
        return;
      }
      if (typeof data.classroomUrl !== "string" || !data.classroomUrl) {
        notify(t("classroom.launchError"), "error");
        return;
      }
      router.push(data.classroomUrl);
    } catch {
      notify(t("classroom.launchError"), "error");
    } finally {
      setEnteringCourseId(null);
    }
  };

  const copyShareUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      notify(t("courseDetail.copySuccess"), "success");
    } catch {
      notify(t("courseDetail.copyFailed"), "error");
    }
  };

  const sameTeacherId = (a: string, b: string) => {
    if (a === b) return true;
    const strip = (value: string) => (value.includes("/") ? value.split("/").pop() || value : value);
    return strip(a) === strip(b);
  };

  const makeTeacherFromSearchResult = (u: UserSearchResult): CourseTeacherSummary => ({
    teacherId: u.casdoorUuid || u.id,
    teacherName: u.displayName || u.name || u.email || u.id,
    teacherAvatar: u.avatar || "",
  });

  const teacherInitial = (teacher: Pick<CourseTeacherSummary, "teacherName" | "teacherId">) =>
    (teacher.teacherName || teacher.teacherId || "T").trim().slice(0, 1).toUpperCase();

  const getCourseStudentPreview = (course: Course) => {
    const students = new Map<string, string>();
    for (const student of course.students ?? []) {
      const id = student.studentId;
      if (id) students.set(id, student.studentName || id);
    }
    for (const link of course.groupLinks ?? []) {
      for (const member of link.group.members ?? []) {
        const id = member.userId;
        if (id && !students.has(id)) {
          students.set(id, member.userName || id);
        }
      }
    }
    const names = [...students.values()];
    const directCount = course.students?.length ?? 0;
    const groupCount = Math.max(0, students.size - directCount);
    return {
      total: students.size,
      directCount,
      groupCount,
      preview: names.slice(0, 4),
    };
  };

  const addCreateTeacher = (teacher: CourseTeacherSummary, makePrimary = false) => {
    setCreateTeachers((prev) => {
      const exists = prev.some((item) => sameTeacherId(item.teacherId, teacher.teacherId));
      return exists ? prev : [...prev, teacher];
    });
    if (makePrimary || !createPrimaryTeacherId) {
      setCreatePrimaryTeacherId(teacher.teacherId);
    }
  };

  const removeCreateTeacher = (teacherId: string) => {
    setCreateTeachers((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((item) => !sameTeacherId(item.teacherId, teacherId));
      if (sameTeacherId(createPrimaryTeacherId, teacherId)) {
        setCreatePrimaryTeacherId(next[0]?.teacherId || "");
      }
      return next;
    });
  };

  const fetchCreateTeacherOptions = useCallback(async (force = false) => {
    setCreateTeacherSearching(true);
    setCreateTeacherError("");
    try {
      const teachers = await getTeacherDirectory({ force });
      setCreateTeacherResults(teachers);
      if (!teachers.length) {
        setCreateTeacherError(t("teacherDashboard.searchUserNotFound"));
      }
    } catch (error) {
      setCreateTeacherError(
        error instanceof Error ? error.message : t("common.failed"),
      );
    } finally {
      setCreateTeacherSearching(false);
    }
  }, [t]);

  const handleSelectCreateTeacher = (teacherId: string) => {
    const result = createTeacherResults.find((item) => {
      const teacher = makeTeacherFromSearchResult(item);
      return sameTeacherId(teacher.teacherId, teacherId);
    });
    if (!result) return;
    addCreateTeacher(makeTeacherFromSearchResult(result));
  };

  const openCreateDialog = () => {
    setCreateError("");
    resetCreateTeacherSelection();
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!createOpen) return;
    queueMicrotask(() => {
      if (!createTeacherResults.length) {
        void fetchCreateTeacherOptions();
      }
    });
  }, [createOpen, createTeacherResults.length, fetchCreateTeacherOptions]);

  const previewPrimaryTeacher =
    createTeachers.find((teacher) =>
      sameTeacherId(teacher.teacherId, createPrimaryTeacherId),
    ) || createTeachers[0] || currentTeacher;
  const previewAssistantTeachers = createTeachers.filter(
    (teacher) => !sameTeacherId(teacher.teacherId, previewPrimaryTeacher.teacherId),
  );

  const handleCreateStartTimeChange = (value: string) => {
    setCreateStartTime(value);
    setCreateEndTime(addMinutesToLocalValue(value, createDurationMinutes));
    setCreateError("");
  };

  const handleCreateDurationChange = (value: number) => {
    const duration = normalizeCourseDuration(value);
    setCreateDurationMinutes(duration);
    if (createStartTime) {
      setCreateEndTime(addMinutesToLocalValue(createStartTime, duration));
    }
    setCreateError("");
  };

  const handleCreateEndTimeChange = (value: string) => {
    setCreateEndTime(value);
    if (createStartTime && value) {
      setCreateDurationMinutes(
        durationBetweenLocalValues(createStartTime, value, createDurationMinutes),
      );
    }
    setCreateError("");
  };

  const handleCreateCourse = async () => {
    if (createLockRef.current) return;
    if (!createName.trim()) { setCreateError(t("teacherDashboard.errNameEmpty")); return; }
    if (!createStartTime) { setCreateError(t("teacherDashboard.errStartTimeEmpty")); return; }
    if (new Date(createStartTime) < new Date(Date.now() - 120000)) { setCreateError(t("teacherDashboard.errStartTimePast")); return; }
    if (!createEndTime) { setCreateError(t("teacherDashboard.errEndTimeEmpty")); return; }
    if (new Date(createEndTime) <= new Date(createStartTime)) { setCreateError(t("teacherDashboard.errEndTimeBefore")); return; }
    if (createRoomType === 10 && createRequirePasscode) {
      if (createPasscode && !/^\d{6}$/.test(createPasscode)) {
        setCreateError(t("teacherDashboard.errPasscodeInvalid"));
        return;
      }
    }
    const selectedPrimaryTeacher =
      createTeachers.find((teacher) =>
        sameTeacherId(teacher.teacherId, createPrimaryTeacherId)
      ) || createTeachers[0] || currentTeacher;

    const now = Date.now();
    if (now - lastCreateSubmitAtRef.current < CREATE_SUBMIT_DEBOUNCE_MS) {
      return;
    }
    lastCreateSubmitAtRef.current = now;
    
    createLockRef.current = true;
    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          description: createDesc,
          roomType: createRoomType,
          requirePasscode: createRoomType === 10 ? createRequirePasscode : undefined,
          passcode: createRoomType === 10 && createRequirePasscode ? createPasscode : undefined,
          startTime: new Date(createStartTime).toISOString(),
          endTime: new Date(createEndTime).toISOString(),
          primaryTeacher: selectedPrimaryTeacher,
          teachers: createTeachers.length ? createTeachers : [currentTeacher],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("common.failed"));
      }
      const { course } = await res.json();
      setCreateOpen(false);
      setCreateName(""); setCreateDesc(""); setCreateRoomType(0); setCreateRequirePasscode(true); setCreatePasscode(""); setCreateStartTime(""); setCreateEndTime(""); setCreateDurationMinutes(DEFAULT_COURSE_DURATION_MINUTES);
      resetCreateTeacherSelection();
      router.push(`/courses/${course.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      createLockRef.current = false;
      setCreateLoading(false);
    }
  };

  const generateCalendarDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSearchResults(data.users ?? []);
        if (!data.users?.length) setSearchError(t("teacherDashboard.searchUserNotFound"));
      } else {
        setSearchResults([]);
        setSearchError(data.hint || data.error || t("common.failed"));
      }
    } catch {
      setSearchResults([]);
      setSearchError(t("common.failed"));
    } finally {
      setSearching(false);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      });
      if (res.ok) {
        setNewGroupName("");
        await fetchMyGroups();
      }
    } finally {
      setGroupBusy(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (
      !(await confirmAction({
        description: t("teacherDashboard.deleteGroupConfirm"),
        tone: "danger",
      }))
    ) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", groupId }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleAddUserToGroup = async (u: UserSearchResult) => {
    if (!memberTargetGroupId) {
      notify(t("teacherDashboard.selectTargetGroup"), "error");
      return;
    }
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addMembers",
          groupId: memberTargetGroupId,
          members: [{ userId: u.id, userName: u.displayName || u.name, userAvatar: u.avatar || "" }],
        }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (
      !(await confirmAction({
        description: t("teacherDashboard.removeMemberConfirm"),
        tone: "danger",
      }))
    ) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeMembers", groupId, userIds: [userId] }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  function countMembers(g: GroupNode): number {
    let n = g.members?.length ?? 0;
    for (const c of g.children ?? []) n += countMembers(c);
    return n;
  }

  function flattenGroups(roots: GroupNode[], prefix = ""): { id: string; label: string }[] {
    const rows: { id: string; label: string }[] = [];
    for (const g of roots) {
      const label = prefix ? `${prefix} / ${g.name}` : g.name;
      rows.push({ id: g.id, label });
      if (g.children?.length) rows.push(...flattenGroups(g.children, label));
    }
    return rows;
  }

  const calendarDaysList = useMemo(() => {
    try {
      return JSON.parse(t("teacherDashboard.calendarDays"));
    } catch {
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    }
  }, [t]);

  return (
    <PortalShell
      role="teacher"
      user={user}
      activePage={activePage}
      onPageChange={(page: PortalPage) => setActivePage(page as SidebarPage)}
      onLogout={logout}
    >
      <main className="w-full">

        {/* ──── Schedule Page ──── */}
        {activePage === "schedule" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PortalDashboardHero
              role="teacher"
              courses={courses}
              enteringCourseId={enteringCourseId}
              onEnter={(course) =>
                void handleEnterClassroomFromList(course as Course)
              }
              onOpen={(course) => router.push(`/courses/${course.id}`)}
              onCreate={openCreateDialog}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Calendar Sidebar */}
              <div className="lg:col-span-4 xl:col-span-3">
                <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
                  <div className="p-4 flex items-center justify-between border-b border-border/40">
                    <Button variant="ghost" size="icon" onClick={() => shiftCalendarMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="font-semibold text-sm">
                      {selectedDate.toLocaleString(locale, {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => shiftCalendarMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {calendarDaysList.map((d: string) => (
                        <div key={d} className="text-xs font-semibold text-muted-foreground py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {generateCalendarDays().map((date, idx) => {
                        if (!date) return <div key={idx} className="h-8" />;
                        const isSelected = isSameDay(date, selectedDate);
                        const isToday = isSameDay(date, new Date());
                        const hasCourse = courses.some(c => c.startTime && isSameDay(new Date(c.startTime), date));
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()))}
                            className={`
                              relative h-8 w-8 rounded-full flex items-center justify-center text-sm transition-all mx-auto
                              ${isSelected ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'hover:bg-muted text-foreground'}
                              ${isToday && !isSelected ? 'text-primary font-bold' : ''}
                            `}
                          >
                            {date.getDate()}
                            {hasCourse && !isSelected && (
                              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary"></span>
                            )}
                            {hasCourse && isSelected && (
                              <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary-foreground"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Daily Schedule List */}
              <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                    {selectedDate.toLocaleString(locale, { month: 'long', day: 'numeric' })} {t("teacherDashboard.schedule")}
                  </h3>
                </div>
                
                {selectedCourses.length === 0 ? (
                  <Card className="border border-border/60 bg-card/40 border-dashed p-12 text-center flex flex-col items-center rounded-2xl">
                    <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <p className="text-muted-foreground font-medium">{t("teacherDashboard.noClassSchedule")}</p>
                    {(coursesMissingStartTime?.length ?? 0) > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {t("teacherDashboard.missingTimeCount", { count: coursesMissingStartTime.length })}
                      </p>
                    )}
                  </Card>
                ) : (
                  <div className={scheduleStyles.list}>
                    {selectedCourses.map((course) => (
                      (() => {
                        const studentPreview = getCourseStudentPreview(course);
                        const canTeachCourse = course.canTeach !== false;
                        const timeFormatter = new Intl.DateTimeFormat(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        });
                        const startLabel = course.startTime
                          ? timeFormatter.format(new Date(course.startTime))
                          : "TBD";
                        const endLabel = course.endTime
                          ? timeFormatter.format(new Date(course.endTime))
                          : "—";
                        const inviteLinks = [
                          ...(course.activeCourseShareLinks || []).map((link) => ({
                            id: link.id,
                            label: link.label,
                            url: link.courseShareUrl,
                            icon: BookOpen,
                          })),
                          ...(course.activeJoinLinks || []).map((link) => ({
                            id: link.id,
                            label: link.label,
                            url: link.joinUrl,
                            icon: PlayCircle,
                          })),
                        ].slice(0, 2);
                        return (
                          <article
                            key={course.id}
                            className={scheduleStyles.card}
                            onMouseEnter={() => router.prefetch(`/courses/${course.id}`)}
                            onFocus={() => router.prefetch(`/courses/${course.id}`)}
                          >
                            <div className={scheduleStyles.time}>
                              <strong>{startLabel}</strong>
                              <span>{endLabel}</span>
                              <i aria-hidden="true" />
                            </div>

                            <div className={scheduleStyles.main}>
                              <div className={scheduleStyles.kicker}>
                                <span className={scheduleStyles.roomBadge}>
                                  {t(ROOM_TYPE_KEYS[course.roomType]) ||
                                    t("common.unknown")}
                                </span>
                                <CourseStatusBadge status={course.status} />
                                {!canTeachCourse && (
                                  <Badge
                                    variant="outline"
                                    className="h-5 border-blue-500/20 bg-blue-500/10 text-[9px] text-blue-700 dark:text-blue-300"
                                  >
                                    {t("common.roleStudent")}
                                  </Badge>
                                )}
                              </div>
                              <button
                                type="button"
                                className={scheduleStyles.title}
                                onClick={() => router.push(`/courses/${course.id}`)}
                              >
                                {course.name}
                              </button>
                              <div className={scheduleStyles.meta}>
                                <span>
                                  <User aria-hidden="true" />
                                  {course.teacherName}
                                </span>
                                <span>
                                  <Users aria-hidden="true" />
                                  {t("teacherDashboard.studentsCount", {
                                    count: studentPreview.total,
                                  })}
                                </span>
                                {studentPreview.groupCount > 0 && (
                                  <span>
                                    <Users aria-hidden="true" />
                                    {t("teacherDashboard.fromGroups", {
                                      count: studentPreview.groupCount,
                                    })}
                                  </span>
                                )}
                              </div>
                              <p className={scheduleStyles.description}>
                                {course.description || t("courseDetail.noDescription")}
                              </p>
                              <div className={scheduleStyles.hoverDetails}>
                                {course.roomType === 10 && course.passcode && (
                                  <button
                                    type="button"
                                    className={scheduleStyles.linkChip}
                                    onClick={() => void copyShareUrl(course.passcode!)}
                                    title={t("courseDetail.btnCopy")}
                                  >
                                    <Key aria-hidden="true" />
                                    {t("courseDetail.passcodeLabel")}: {course.passcode}
                                  </button>
                                )}
                                {canTeachCourse &&
                                  inviteLinks.map((link) => {
                                    const InviteIcon = link.icon;
                                    return (
                                      <button
                                        type="button"
                                        className={scheduleStyles.linkChip}
                                        key={link.id}
                                        onClick={() => void copyShareUrl(link.url)}
                                      >
                                        <InviteIcon aria-hidden="true" />
                                        {link.label.trim()
                                          ? link.label.slice(0, 14)
                                          : t("teacherDashboard.quickInvite")}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>

                            <div className={scheduleStyles.actions}>
                              <Button
                                disabled={
                                  enteringCourseId === course.id ||
                                  (course.status === "finished"
                                    ? !course.recordUrl
                                    : !canEnterClassroom(course.status))
                                }
                                className={scheduleStyles.enterButton}
                                onMouseEnter={() => router.prefetch("/classroom")}
                                onClick={() => {
                                  if (course.status === "finished") {
                                    const target = getPlaybackTarget(
                                      course.id,
                                      course.recordUrl,
                                    );
                                    if (target?.kind === "internal") {
                                      router.push(target.href);
                                    } else if (target) {
                                      window.open(
                                        target.href,
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                    }
                                  } else {
                                    void handleEnterClassroomFromList(course);
                                  }
                                }}
                              >
                                {enteringCourseId === course.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                                <span>
                                  {enteringCourseId === course.id
                                    ? t("teacherDashboard.btnEntering")
                                    : course.status === "finished"
                                      ? course.recordUrl
                                        ? t("studentDashboard.viewPlayback")
                                        : t("studentDashboard.livePlayback")
                                      : t("teacherDashboard.btnEnterClass")}
                                </span>
                              </Button>
                              <div className={scheduleStyles.subActions}>
                                {canTeachCourse && (
                                  <CourseStatusSelect
                                    value={course.status}
                                    onValueChange={(status) =>
                                      handleStatusChange(course.id, status)
                                    }
                                    disabled={
                                      statusUpdatingCourseId === course.id
                                    }
                                  />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={scheduleStyles.detailsButton}
                                  onClick={() =>
                                    router.push(`/courses/${course.id}`)
                                  }
                                  title={t("teacherDashboard.btnDetails")}
                                >
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </article>
                        );
                      })()
                    ))}
                  </div>
                )}

                {coursesMissingStartTime.length > 0 && (
                  <Card className="border border-orange-500/20 bg-orange-500/5 mt-8 rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-orange-600 dark:text-orange-400 text-lg flex items-center gap-2"><Info className="h-5 w-5" /> {t("teacherDashboard.missingTimeListTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {coursesMissingStartTime.map((c) => (
                          <li key={c.id} className="flex justify-between items-center text-sm p-2 rounded hover:bg-muted transition-colors">
                            <span className="font-medium">{c.name}</span>
                            <Button variant="link" size="sm" className="text-orange-600 dark:text-orange-400" onClick={() => router.push(`/courses/${c.id}`)}>{t("teacherDashboard.missingTimeBtn")}</Button>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {activePage === "courses" && (
          <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-300">
            <PortalCourseLibrary
              courses={courses}
              enteringCourseId={enteringCourseId}
              onEnter={(course) =>
                void handleEnterClassroomFromList(course as Course)
              }
              onOpen={(course) => router.push(`/courses/${course.id}`)}
            />
          </div>
        )}

        {/* ──── Student Management Page ──── */}
        {activePage === "students" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PortalSectionHeader
              eyebrow={t("teacherDashboard.learningNetwork")}
              title={t("teacherDashboard.studentManage")}
              description={t("teacherDashboard.searchDesc")}
              metric={{
                value: myGroups.length,
                label: t("teacherDashboard.studentGroupManage"),
              }}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Search & Add */}
              <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> {t("teacherDashboard.searchUser")}</CardTitle>
                  <CardDescription className="text-xs">{t("teacherDashboard.searchDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("teacherDashboard.searchPlaceholder")}
                      value={searchQuery}
                      className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <Button 
                      className="bg-primary hover:bg-primary/95 text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all shrink-0" 
                      onClick={handleSearch} 
                      disabled={searching || !searchQuery.trim()}
                    >
                      {searching ? t("teacherDashboard.searching") : t("teacherDashboard.btnSearch")}
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.addToGroupLabel")}</label>
                      <Select value={memberTargetGroupId} onValueChange={setMemberTargetGroupId}>
                        <SelectTrigger className="w-full bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl">
                          <SelectValue placeholder={t("teacherDashboard.selectTargetGroup")} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border/85">
                          {flattenGroups(myGroups).map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {searchError && (
                    <p className="text-xs text-red-500 bg-red-500/5 p-3 rounded-xl border border-red-500/20">
                      {searchError}
                    </p>
                  )}

                  {searchResults.length > 0 && (
                    <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {searchResults.map((u) => (
                        <div key={u.id} className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/20 transition-all">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{u.displayName || u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-primary/5 text-primary hover:bg-primary/10 rounded-lg text-xs"
                            disabled={groupBusy || !memberTargetGroupId}
                            onClick={() => handleAddUserToGroup(u)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" /> {t("teacherDashboard.btnAddToGroup")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Right: Groups */}
              <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {t("teacherDashboard.studentGroupManage")}</CardTitle>
                  <CardDescription className="text-xs">{t("teacherDashboard.groupManageDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("teacherDashboard.newGroupPlaceholder")}
                      value={newGroupName}
                      className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                    />
                    <Button 
                      variant="secondary" 
                      className="shrink-0 rounded-xl text-sm active:scale-[0.98] transition-all" 
                      disabled={groupBusy || !newGroupName.trim()} 
                      onClick={handleCreateGroup}
                    >
                      {t("teacherDashboard.btnCreate")}
                    </Button>
                  </div>

                  {myGroups.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-border/60 rounded-xl text-muted-foreground text-sm bg-muted/20">
                      {t("teacherDashboard.groupEmpty")}
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {myGroups.map((g) => (
                        <div key={g.id} className="rounded-xl border border-border/60 overflow-hidden bg-muted/10">
                          <div className="flex justify-between items-center p-3 bg-muted/40 border-b border-border/50">
                            <div className="flex items-center gap-2">
                              <strong className="text-sm font-semibold">{g.name}</strong>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/10">{countMembers(g)} {t("teacherDashboard.memberCount")}</Badge>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10" disabled={groupBusy} onClick={() => handleDeleteGroup(g.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="p-2 bg-card">
                            {(g.members?.length ?? 0) > 0 ? (
                              <div className="space-y-1">
                                {g.members.map((m) => (
                                  <div key={m.userId} className="flex justify-between items-center p-2 rounded-lg hover:bg-muted transition-colors group">
                                    <span className="text-sm text-foreground/80 font-medium">{m.userName || m.userId}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all" onClick={() => handleRemoveMember(g.id, m.userId)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-4 italic">{t("teacherDashboard.groupMemberEmpty")}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ──── Settings Page ──── */}
        {activePage === "settings" && (
          <SettingsPanel user={user} onLogout={logout} />
        )}

        {/* ──── Create Course Dialog ──── */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className={createCourseStyles.dialog}>
            <aside className={createCourseStyles.preview} aria-label={t("teacherDashboard.coursePreview")}>
              <span className={createCourseStyles.previewGlow} aria-hidden="true" />
              <div className={createCourseStyles.previewContent}>
                <div className={createCourseStyles.previewTop}>
                  <span className={createCourseStyles.eyebrow}>
                    <Sparkles aria-hidden="true" />
                    Classroom studio
                  </span>
                  <span className={createCourseStyles.draftBadge}>
                    {t("teacherDashboard.draft")}
                  </span>
                </div>

                <div className={createCourseStyles.previewTitle}>
                  <small>{t("teacherDashboard.liveCourseBrief")}</small>
                  <h2>
                    {createName.trim() ||
                      t("teacherDashboard.nameNewClassroom")}
                  </h2>
                  <p>
                    {createDesc.trim() ||
                      t("teacherDashboard.courseBriefHint")}
                  </p>
                </div>

                <div className={createCourseStyles.stage} aria-hidden="true">
                  <div className={createCourseStyles.stageBar}>
                    <span>CLASSROOM · PREVIEW</span>
                    <span className={createCourseStyles.stageLive}>READY</span>
                  </div>
                  <div className={createCourseStyles.teacherTile}>
                    <Avatar className={createCourseStyles.teacherAvatar}>
                      <AvatarImage src={previewPrimaryTeacher.teacherAvatar || ""} />
                      <AvatarFallback className="bg-[#7b6ff2] text-[11px] font-semibold text-white">
                        {teacherInitial(previewPrimaryTeacher)}
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      <strong>{previewPrimaryTeacher.teacherName}</strong>
                      <span>{t("teacherDashboard.leadTeachingStage")}</span>
                    </span>
                  </div>
                  <div className={createCourseStyles.seatRail}>
                    {previewAssistantTeachers.slice(0, 4).map((teacher) => (
                      <span
                        className={`${createCourseStyles.seat} ${createCourseStyles.occupiedSeat}`}
                        key={teacher.teacherId}
                      >
                        <Avatar className={createCourseStyles.seatAvatar}>
                          <AvatarImage src={teacher.teacherAvatar || ""} />
                          <AvatarFallback>{teacherInitial(teacher)}</AvatarFallback>
                        </Avatar>
                        <small>{teacher.teacherName}</small>
                      </span>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - previewAssistantTeachers.length) }).map((_, seat) => (
                      <span className={createCourseStyles.seat} key={`empty-${seat}`}>
                        <i>{seat + previewAssistantTeachers.length + 1}</i>
                      </span>
                    ))}
                  </div>
                </div>

                <dl className={createCourseStyles.metaGrid}>
                  <div className={createCourseStyles.metaItem}>
                    <dt>
                      <CalendarIcon aria-hidden="true" />
                      {t("teacherDashboard.scheduleLabel")}
                    </dt>
                    <dd>{createSchedulePreview}</dd>
                  </div>
                  <div className={createCourseStyles.metaItem}>
                    <dt>
                      <Users aria-hidden="true" />
                      {t("teacherDashboard.roomMode")}
                    </dt>
                    <dd>{selectedCreateRoomType?.label}</dd>
                  </div>
                  <div className={createCourseStyles.metaItem}>
                    <dt>
                      <UserPlus aria-hidden="true" />
                      {t("teacherDashboard.teachingTeam")}
                    </dt>
                    <dd>
                      {t("teacherDashboard.teacherCount", {
                        count: createTeachers.length,
                      })}
                    </dd>
                  </div>
                  <div className={createCourseStyles.metaItem}>
                    <dt>
                      <CheckCircle2 aria-hidden="true" />
                      {t("teacherDashboard.entryPolicy")}
                    </dt>
                    <dd>
                      {createRoomType === 10 && !createRequirePasscode
                        ? t("teacherDashboard.openEntry")
                        : t("teacherDashboard.identityCheck")}
                    </dd>
                  </div>
                </dl>

                <div className={createCourseStyles.readiness}>
                  <div className={createCourseStyles.readinessTop}>
                    <span>{t("teacherDashboard.setupReadiness")}</span>
                    <strong>{createCompletionPercent}%</strong>
                  </div>
                  <div className={createCourseStyles.progress} aria-hidden="true">
                    <span style={{ width: `${createCompletionPercent}%` }} />
                  </div>
                  <p>
                    {t("teacherDashboard.readinessHint")}
                  </p>
                </div>
              </div>
            </aside>

            <DialogHeader className={createCourseStyles.header}>
              <span className={createCourseStyles.stepLabel}>
                {t("teacherDashboard.courseSetup")}
              </span>
              <DialogTitle className="text-xl font-bold">{t("teacherDashboard.createTitle")}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">{t("teacherDashboard.createDesc")}</DialogDescription>
            </DialogHeader>

            {createError && (
              <div className={createCourseStyles.error}>{createError}</div>
            )}

            <div className={`${createCourseStyles.formBody} space-y-4`}>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.fieldName")} <span className="text-red-400">*</span></label>
                <Input
                  className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 rounded-xl"
                  placeholder={t("teacherDashboard.placeholderFieldName")}
                  value={createName}
                  onChange={(e) => { setCreateName(e.target.value); setCreateError(""); }}
                  maxLength={50}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.fieldDesc")} <span className="text-muted-foreground text-xs">({t("teacherDashboard.optional")})</span></label>
                <Textarea
                  className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 resize-none rounded-xl"
                  placeholder={t("teacherDashboard.placeholderFieldDesc")}
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("common.teachingTeachers")}
                    </label>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("teacherDashboard.teachingTeachersHint")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 bg-primary/10 text-primary border-primary/10">
                    {createTeachers.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {createTeachers.map((teacher) => {
                    const isPrimary = sameTeacherId(teacher.teacherId, createPrimaryTeacherId);
                    return (
                      <div
                        key={teacher.teacherId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-8 w-8 border border-border/70">
                            <AvatarImage src={teacher.teacherAvatar || ""} />
                            <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                              {teacherInitial(teacher)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold">{teacher.teacherName}</span>
                              {isPrimary && (
                                <Badge className="h-5 bg-primary/10 text-primary border border-primary/15 text-[10px]">
                                  {t("common.lead")}
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-[10px] text-muted-foreground">{teacher.teacherId}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!isPrimary && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-md px-2 text-[11px]"
                              onClick={() => setCreatePrimaryTeacherId(teacher.teacherId)}
                            >
                              {t("common.makeLeadTeacher")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            disabled={createTeachers.length <= 1}
                            onClick={() => removeCreateTeacher(teacher.teacherId)}
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Select
                    disabled={createTeacherSearching}
                    onOpenChange={(open) => {
                      if (open && !createTeacherResults.length) {
                        void fetchCreateTeacherOptions();
                      }
                    }}
                    onValueChange={handleSelectCreateTeacher}
                  >
                    <SelectTrigger className="h-9 bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-lg">
                      <SelectValue
                        placeholder={
                          createTeacherSearching
                            ? t("common.loading")
                            : t("teacherDashboard.teacherSelectPlaceholder")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border/85">
                      {createTeacherResults.map((result) => {
                        const teacher = makeTeacherFromSearchResult(result);
                        const alreadySelected = createTeachers.some((item) =>
                          sameTeacherId(item.teacherId, teacher.teacherId)
                        );
                        return (
                          <SelectItem
                            key={teacher.teacherId}
                            value={teacher.teacherId}
                            disabled={alreadySelected}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar className="h-6 w-6 border border-border/60">
                                <AvatarImage src={teacher.teacherAvatar || ""} />
                                <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                  {teacherInitial(teacher)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="min-w-0">
                                <span className="block truncate text-sm">{teacher.teacherName}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {result.email || result.name || teacher.teacherId}
                                </span>
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 shrink-0 rounded-lg px-3 text-xs"
                      disabled={createTeacherSearching}
                      onClick={() => void fetchCreateTeacherOptions(true)}
                      title={t("teacherDashboard.teacherSelectPlaceholder")}
                    >
                    {createTeacherSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {createTeacherError && (
                  <p className="text-xs text-red-500 bg-red-500/5 p-2 rounded-lg border border-red-500/20">
                    {createTeacherError}
                  </p>
                )}
              </div>

              <div className={createCourseStyles.scheduleBlock}>
                <div className={createCourseStyles.scheduleHeading}>
                  <div>
                    <span><Clock aria-hidden="true" />{t("teacherDashboard.classSchedule")}</span>
                    <p>{t("teacherDashboard.classScheduleHint")}</p>
                  </div>
                  <strong>{formatCourseDuration(createDurationMinutes, locale)}</strong>
                </div>

                <div className={createCourseStyles.scheduleGrid}>
                  <label>
                    <span>{t("teacherDashboard.fieldStartTime")} *</span>
                    <Input
                      type="datetime-local"
                      min={minDateTime}
                      value={createStartTime}
                      onChange={(event) => handleCreateStartTimeChange(event.target.value)}
                      onClick={(event) => {
                        try { (event.target as HTMLInputElement).showPicker?.(); } catch {}
                      }}
                    />
                  </label>
                  <label className={createCourseStyles.durationField}>
                    <span>{t("teacherDashboard.durationMinutes")}</span>
                    <Input
                      type="number"
                      min={15}
                      max={720}
                      step={15}
                      value={createDurationMinutes}
                      onChange={(event) => handleCreateDurationChange(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{t("teacherDashboard.fieldEndTime")} *</span>
                    <Input
                      type="datetime-local"
                      min={createStartTime || minDateTime}
                      value={createEndTime}
                      onChange={(event) => handleCreateEndTimeChange(event.target.value)}
                      onClick={(event) => {
                        try { (event.target as HTMLInputElement).showPicker?.(); } catch {}
                      }}
                    />
                  </label>
                </div>

                <div className={createCourseStyles.durationPresets} aria-label={t("teacherDashboard.durationPresets")}>
                  {COURSE_DURATION_PRESETS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      data-active={createDurationMinutes === minutes}
                      onClick={() => handleCreateDurationChange(minutes)}
                    >
                      {formatCourseDuration(minutes, locale)}
                    </button>
                  ))}
                </div>

                <div className={createCourseStyles.timezoneInline}>
                  <div className={createCourseStyles.timezoneHeader}>
                    <span><Globe aria-hidden="true" />{t("teacherDashboard.worldTimes")}</span>
                    <button type="button" onClick={() => setShowTzConfig((current) => !current)}>
                      {showTzConfig
                        ? t("teacherDashboard.hideCountries")
                        : t("teacherDashboard.chooseCountries")}
                    </button>
                  </div>

                  {showTzConfig ? (
                    <div className={createCourseStyles.timezoneConfig}>
                      {SUPPORTED_TIMEZONES.map((timezone) => (
                        <button
                          key={timezone.id}
                          type="button"
                          data-active={selectedTzIds.includes(timezone.id)}
                          onClick={() => handleTzToggle(timezone.id)}
                        >
                          {timezone.flag} {timezoneDisplayName(timezone, locale)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className={createCourseStyles.timezoneRail}>
                    {!createStartTime ? (
                      <small>{t("teacherDashboard.worldTimesChooseStart")}</small>
                    ) : !convertedTimes.length ? (
                      <small>{t("teacherDashboard.worldTimesEmpty")}</small>
                    ) : convertedTimes.map((item) => (
                      <span key={item.id}>
                        <b>{item.flag} {timezoneDisplayName(item, locale)}</b>
                        <strong>{item.convertedTime}</strong>
                        <i>{item.offset}</i>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.fieldType")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {roomTypes.map((rt) => {
                    const IconComponent = rt.icon;
                    return (
                      <button
                        key={rt.value}
                        type="button"
                        onClick={() => {
                          setCreateRoomType(rt.value);
                          if (rt.value === 10 && createRequirePasscode && !createPasscode) {
                            setCreatePasscode(Math.floor(100000 + Math.random() * 900000).toString());
                          }
                        }}
                        className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all text-center ${
                          createRoomType === rt.value
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-border/80"
                        }`}
                      >
                        <IconComponent className={`h-6 w-6 ${createRoomType === rt.value ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-semibold whitespace-nowrap">{rt.label}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-1">{rt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {createRoomType === 10 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.fieldPasscode")}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateRequirePasscode(false);
                        setCreateError("");
                      }}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                        !createRequirePasscode
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      <Globe className="h-4 w-4" />
                      <span>{t("teacherDashboard.openEntryDirect")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateRequirePasscode(true);
                        if (!createPasscode) {
                          setCreatePasscode(Math.floor(100000 + Math.random() * 900000).toString());
                        }
                        setCreateError("");
                      }}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                        createRequirePasscode
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      <Key className="h-4 w-4" />
                      <span>{t("teacherDashboard.requirePasscode")}</span>
                    </button>
                  </div>
                  {createRequirePasscode && (
                    <Input
                      className="bg-background border-primary/20 hover:border-primary/40 focus-visible:ring-primary/40 font-mono text-center text-lg tracking-widest rounded-xl"
                      placeholder={t("teacherDashboard.fieldPasscodePlaceholder")}
                      value={createPasscode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setCreatePasscode(val);
                        setCreateError("");
                      }}
                      maxLength={6}
                    />
                  )}
                </div>
              )}
            </div>

            <DialogFooter className={createCourseStyles.footer}>
              <p className={createCourseStyles.footerNote}>
                {t("teacherDashboard.afterCreateHint")}
              </p>
              <div className={createCourseStyles.footerActions}>
                <Button variant="ghost" className="rounded-xl text-xs" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
                <Button
                  className={createCourseStyles.createButton}
                  onClick={handleCreateCourse}
                  disabled={
                    createLoading ||
                    !createName.trim() ||
                    !createStartTime ||
                    !createEndTime
                  }
                >
                  {createLoading ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      {t("teacherDashboard.btnCreateCourse")}
                      <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </PortalShell>
  );
}

function SettingsPanel({ user, onLogout }: { user: TeacherUser; onLogout: () => void }) {
  const { t } = useTranslation();
  const { updateUserAvatar } = useAuth();
  const [avatarDraft, setAvatarDraft] = useState(user.avatar || "");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setAvatarDraft(user.avatar || "");
    });
  }, [user.avatar]);

  const handleSaveAvatar = async () => {
    const avatar = avatarDraft.trim();
    setAvatarSaving(true);
    setAvatarMessage("");

    try {
      const res = await fetch("/api/auth/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ avatar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarMessage(
          data?.error === "Invalid avatar URL"
            ? t("settingsPanel.errAvatarUrlInvalid")
            : t("settingsPanel.avatarUpdateFailed")
        );
        return;
      }

      const nextAvatar = typeof data?.avatar === "string" ? data.avatar : avatar;
      updateUserAvatar(nextAvatar);
      setAvatarDraft(nextAvatar);
      setAvatarMessage(t("settingsPanel.avatarUpdateSuccess"));
    } catch {
      setAvatarMessage(t("settingsPanel.avatarUpdateFailed"));
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PortalSectionHeader
        eyebrow="Account"
        title={t("settingsPanel.title")}
        description={t("settingsPanel.desc")}
      />

      <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("settingsPanel.basicInfo")}</CardTitle>
          <CardDescription className="text-xs">{t("settingsPanel.basicInfoDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldUsername")}</label>
              <div className="font-semibold text-foreground text-sm">{user.name || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldDisplayName")}</label>
              <div className="font-semibold text-foreground text-sm">{user.displayName || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldEmail")}</label>
              <div className="font-semibold text-foreground text-sm">{user.email || "—"}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldRole")}</label>
              <div>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-semibold flex items-center gap-1 w-fit">
                  <User className="h-3 w-3" />
                  <span>{t("common.roleTeacher")}</span>
                </Badge>
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("settingsPanel.fieldUserId")}</label>
              <div className="font-mono text-xs bg-muted/40 p-2.5 rounded-xl border border-border/40 break-all select-all">{user.userId}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("settingsPanel.avatar")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-start">
          <Avatar className="h-16 w-16 border border-border/80 shadow-inner">
            <AvatarImage src={avatarDraft.trim() || user.avatar} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">{user.displayName?.[0] || user.name?.[0] || "T"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("settingsPanel.avatarDesc")}
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t("settingsPanel.avatarUrl")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="url"
                  value={avatarDraft}
                  onChange={(e) => {
                    setAvatarDraft(e.target.value);
                    setAvatarMessage("");
                  }}
                  placeholder={t("settingsPanel.avatarUrlPlaceholder")}
                  className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                />
                <Button
                  type="button"
                  className="rounded-xl text-xs"
                  disabled={avatarSaving}
                  onClick={() => void handleSaveAvatar()}
                >
                  {avatarSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("settingsPanel.btnSaveAvatar")
                  )}
                </Button>
              </div>
              {avatarMessage && (
                <p className="text-xs text-muted-foreground">{avatarMessage}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-destructive/20 bg-destructive/5 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-destructive">{t("settingsPanel.security")}</CardTitle>
          <CardDescription className="text-xs text-destructive/80">{t("settingsPanel.securityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Button variant="destructive" onClick={onLogout} className="rounded-xl text-xs active:scale-95 transition-all">
            <LogOut className="mr-2 h-4 w-4" /> {t("settingsPanel.btnLogout")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
