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
import { Calendar as CalendarIcon, Users, Settings, LogOut, ChevronLeft, ChevronRight, PlayCircle, Plus, Search, Trash2, Link as LinkIcon, UserPlus, Info, Clock, Globe, Key, Loader2, User, BookOpen, RefreshCw } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { canEnterClassroom, CourseStatus } from "@/lib/course-status";
import { useTranslation } from "@/lib/i18n/context";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { SiteLogo } from "@/components/SiteLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { CourseTimeRangeDisplay } from "@/components/TimeDisplay";
import { CourseTeacherAvatarGroup, type CourseTeacherAvatarItem } from "@/components/CourseTeacherAvatarGroup";

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

interface UserSearchResult {
  id: string;
  casdoorUuid?: string | null;
  name: string;
  displayName: string;
  email: string;
  avatar?: string;
  role?: string;
}

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

type SidebarPage = "schedule" | "students" | "settings";

interface TimezoneConfig {
  id: string;
  nameCN: string;
  nameEN: string;
  timezone: string;
  flag: string;
  offset: string;
}

const SUPPORTED_TIMEZONES: TimezoneConfig[] = [
  { id: "SG", nameCN: "新加坡", nameEN: "Singapore", timezone: "Asia/Singapore", flag: "🇸🇬", offset: "UTC+8" },
  { id: "MY", nameCN: "马来西亚", nameEN: "Malaysia", timezone: "Asia/Kuala_Lumpur", flag: "🇲🇾", offset: "UTC+8" },
  { id: "PH", nameCN: "菲律宾", nameEN: "Philippines", timezone: "Asia/Manila", flag: "🇵🇭", offset: "UTC+8" },
  { id: "TH", nameCN: "泰国", nameEN: "Thailand", timezone: "Asia/Bangkok", flag: "🇹🇭", offset: "UTC+7" },
  { id: "VN", nameCN: "越南", nameEN: "Vietnam", timezone: "Asia/Ho_Chi_Minh", flag: "🇻🇳", offset: "UTC+7" },
  { id: "ID_WIB", nameCN: "印尼 (雅加达)", nameEN: "Indonesia (Jakarta)", timezone: "Asia/Jakarta", flag: "🇮🇩", offset: "UTC+7" },
  { id: "ID_WITA", nameCN: "印尼 (巴厘岛)", nameEN: "Indonesia (Bali)", timezone: "Asia/Makassar", flag: "🇮🇩", offset: "UTC+8" },
  { id: "LA", nameCN: "老挝", nameEN: "Laos", timezone: "Asia/Vientiane", flag: "🇱🇦", offset: "UTC+7" },
  { id: "KH", nameCN: "柬埔寨", nameEN: "Cambodia", timezone: "Asia/Phnom_Penh", flag: "🇰🇭", offset: "UTC+7" },
  { id: "MM", nameCN: "缅甸", nameEN: "Myanmar", timezone: "Asia/Yangon", flag: "🇲🇲", offset: "UTC+6:30" },
  { id: "CN", nameCN: "中国 (北京)", nameEN: "China (Beijing)", timezone: "Asia/Shanghai", flag: "🇨🇳", offset: "UTC+8" },
  { id: "JP", nameCN: "日本", nameEN: "Japan", timezone: "Asia/Tokyo", flag: "🇯🇵", offset: "UTC+9" },
  { id: "KR", nameCN: "韩国", nameEN: "South Korea", timezone: "Asia/Seoul", flag: "🇰🇷", offset: "UTC+9" },
  { id: "US_EST", nameCN: "美国 (东部)", nameEN: "US (Eastern)", timezone: "America/New_York", flag: "🇺🇸", offset: "UTC-5" },
  { id: "US_PST", nameCN: "美国 (西部)", nameEN: "US (Pacific)", timezone: "America/Los_Angeles", flag: "🇺🇸", offset: "UTC-8" },
  { id: "UK", nameCN: "英国 (伦敦)", nameEN: "United Kingdom", timezone: "Europe/London", flag: "🇬🇧", offset: "UTC+0" },
  { id: "FR", nameCN: "法国 (巴黎)", nameEN: "France (Paris)", timezone: "Europe/Paris", flag: "🇫🇷", offset: "UTC+1" },
  { id: "DE", nameCN: "德国 (柏林)", nameEN: "Germany (Berlin)", timezone: "Europe/Berlin", flag: "🇩🇪", offset: "UTC+1" }
];

const DEFAULT_TIMEZONE_IDS = ["TH", "VN", "SG", "ID_WIB"];
const CREATE_SUBMIT_DEBOUNCE_MS = 1200;

export default function TeacherDashboard({ courses, user, fetchCourses }: { courses: Course[], user: TeacherUser, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("schedule");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [enteringCourseId, setEnteringCourseId] = useState<string | null>(null);
  const { t, locale } = useTranslation();

  // Create course dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createRoomType, setCreateRoomType] = useState(0);
  const [createRequirePasscode, setCreateRequirePasscode] = useState(true);
  const [createPasscode, setCreatePasscode] = useState("");
  const [createStartTime, setCreateStartTime] = useState("");
  const [createEndTime, setCreateEndTime] = useState("");
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
    setCreateTeacherResults([]);
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
          const formatted = localDate.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
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
    const statusLabel = status === 'finished' ? t("teacherDashboard.statusFinished") : t("teacherDashboard.statusCancelled");
    if (!confirm(t("teacherDashboard.confirmFinishCancel", { status: statusLabel }))) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCourses();
      }
    } catch (err) {
      console.error(err);
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
        alert(data.reason || t("classroom.launchError"));
        return;
      }
      const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
      router.push(
        `/classroom?${new URLSearchParams({
          roomUuid,
          roomType: String(course.roomType),
          roomName: course.name,
          courseId: course.id,
        }).toString()}`
      );
    } catch {
      alert(t("classroom.launchError"));
    } finally {
      setEnteringCourseId(null);
    }
  };

  const copyShareUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert(t("courseDetail.copySuccess"));
    } catch {
      alert(t("courseDetail.copyFailed"));
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

  const getCourseTeacherItems = (course: Course): CourseTeacherAvatarItem[] => {
    const teachers =
      course.teachers && course.teachers.length > 0
        ? course.teachers
        : [{
            teacherId: course.teacherId,
            teacherName: course.teacherName,
            teacherAvatar: course.teacherAvatar || "",
          }];
    const uniqueTeachers: CourseTeacherAvatarItem[] = [];
    for (const teacher of teachers) {
      if (!uniqueTeachers.some((item) => sameTeacherId(item.teacherId, teacher.teacherId))) {
        uniqueTeachers.push({
          teacherId: teacher.teacherId,
          teacherName: teacher.teacherName || teacher.teacherId,
          teacherAvatar: teacher.teacherAvatar || "",
        });
      }
    }
    return uniqueTeachers;
  };

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

  const fetchCreateTeacherOptions = useCallback(async () => {
    setCreateTeacherSearching(true);
    setCreateTeacherError("");
    try {
      const res = await fetch(
        "/api/users/teachers?limit=100",
        { credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const teachers = data.teachers ?? data.users ?? [];
        setCreateTeacherResults(teachers);
        if (!teachers.length) {
          setCreateTeacherError(t("teacherDashboard.searchUserNotFound"));
        }
      } else {
        setCreateTeacherResults([]);
        setCreateTeacherError(data.hint || data.error || t("common.failed"));
      }
    } catch {
      setCreateTeacherResults([]);
      setCreateTeacherError(t("common.failed"));
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
      void fetchCreateTeacherOptions();
    });
  }, [createOpen, fetchCreateTeacherOptions]);

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
      setCreateName(""); setCreateDesc(""); setCreateRoomType(0); setCreateRequirePasscode(true); setCreatePasscode(""); setCreateStartTime(""); setCreateEndTime("");
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
    if (!confirm(t("teacherDashboard.deleteGroupConfirm"))) return;
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
      alert(t("teacherDashboard.selectTargetGroup"));
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
    if (!confirm(t("teacherDashboard.removeMemberConfirm"))) return;
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
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-300">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-card/60 backdrop-blur-md px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <SiteLogo decorative className="h-6 w-6 text-primary animate-pulse" />
            <span className="font-extrabold text-lg bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("common.appName") || "在线课堂"}
            </span>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1 text-[10px] font-semibold">
            <User className="h-3 w-3" />
            <span>{t("common.roleTeacher")}</span>
          </Badge>
        </div>

        {/* Center: Apple-style segment controller buttons */}
        <div className="hidden md:flex bg-muted/60 border border-border/40 p-1 rounded-xl">
          <Button 
            variant="ghost" 
            size="sm"
            className={`rounded-lg font-medium px-4 py-1 text-xs transition-all ${activePage === 'schedule' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActivePage('schedule')}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" /> {t("teacherDashboard.schedule")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className={`rounded-lg font-medium px-4 py-1 text-xs transition-all ${activePage === 'students' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActivePage('students')}
          >
            <Users className="mr-1.5 h-3.5 w-3.5" /> {t("teacherDashboard.studentManage")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className={`rounded-lg font-medium px-4 py-1 text-xs transition-all ${activePage === 'settings' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActivePage('settings')}
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" /> {t("settingsPanel.title")}
          </Button>
        </div>

        {/* Right side: Global settings & user profile */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-3 border-l border-border/40 pl-4">
            <Avatar className="h-8 w-8 border border-primary/20 shadow-sm">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{user.displayName?.[0] || 'T'}</AvatarFallback>
            </Avatar>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-foreground truncate max-w-[100px]">{user.displayName || user.name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive h-8 w-8 hover:bg-destructive/10 rounded-lg transition-colors"
              onClick={logout}
              title={t("common.logout")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full relative">
        {/* Mobile Page Selector */}
        <div className="flex md:hidden bg-muted/60 border border-border/40 p-1 rounded-xl mb-6">
          <Button 
            variant="ghost" 
            size="sm"
            className={`flex-1 rounded-lg font-medium py-2 text-xs transition-all ${activePage === 'schedule' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActivePage('schedule')}
          >
            <CalendarIcon className="mr-1 h-3.5 w-3.5" /> {t("teacherDashboard.schedule")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className={`flex-1 rounded-lg font-medium py-2 text-xs transition-all ${activePage === 'students' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActivePage('students')}
          >
            <Users className="mr-1 h-3.5 w-3.5" /> {t("teacherDashboard.studentManage")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className={`flex-1 rounded-lg font-medium py-2 text-xs transition-all ${activePage === 'settings' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActivePage('settings')}
          >
            <Settings className="mr-1 h-3.5 w-3.5" /> {t("settingsPanel.title")}
          </Button>
        </div>

        {/* ──── Schedule Page ──── */}
        {activePage === "schedule" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">{t("teacherDashboard.schedule")}</h2>
                <p className="text-muted-foreground mt-1 text-sm font-medium">{t("teacherDashboard.groupManageDesc")}</p>
              </div>
              <Button onClick={openCreateDialog} className="bg-primary hover:bg-primary/95 text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all">
                <Plus className="mr-2 h-4 w-4" /> {t("teacherDashboard.createCourse")}
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Calendar Sidebar */}
              <div className="lg:col-span-4 xl:col-span-3">
                <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
                  <div className="p-4 flex items-center justify-between border-b border-border/40">
                    <Button variant="ghost" size="icon" onClick={() => shiftCalendarMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="font-semibold text-sm">
                      {locale === "zh-CN" || locale === "ja" 
                        ? `${selectedDate.getFullYear()}${t("teacherDashboard.calendarYear")} ${selectedDate.getMonth() + 1}${t("teacherDashboard.calendarMonth")}` 
                        : selectedDate.toLocaleString(locale, { month: 'long', year: 'numeric' })}
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
                  <div className="space-y-4">
                    {selectedCourses.map((course) => (
                      (() => {
                        const studentPreview = getCourseStudentPreview(course);
                        return (
                      <Card key={course.id} className="border border-border/60 bg-card overflow-hidden rounded-2xl hover:border-primary/30 hover:shadow-md transition-all duration-300 flex flex-col md:flex-row">
                        {/* Left date block */}
                        <div className="md:w-64 bg-muted/40 p-6 flex flex-col justify-center items-center text-center border-b md:border-b-0 md:border-r border-border/50">
                          <CalendarIcon className="h-7 w-7 text-primary/80 mb-2" />
                          <div className="font-semibold text-sm text-foreground/90 leading-tight">
                            <CourseTimeRangeDisplay
                              startIsoString={course.startTime}
                              endIsoString={course.endTime}
                            />
                          </div>
                          <Badge variant="outline" className="mt-3 border-primary/20 bg-primary/5 text-primary text-[10px]">
                            {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
                          </Badge>
                        </div>

                        {/* Right contents block */}
                        <div className="flex-1 p-6 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-lg font-bold text-foreground hover:text-primary transition-colors cursor-pointer" onClick={() => router.push(`/courses/${course.id}`)}>
                                    {course.name}
                                  </h3>
                                  <CourseStatusBadge status={course.status} />
                                  {course.roomType === 10 && course.passcode && (
                                    <Badge 
                                      variant="outline" 
                                      className="border-primary/20 bg-primary/5 text-primary cursor-pointer flex items-center gap-1 hover:bg-primary/10 transition-colors font-mono"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void copyShareUrl(course.passcode!);
                                      }}
                                      title={t("courseDetail.btnCopy")}
                                    >
                                      <Key className="h-3 w-3" />
                                      <span>{t("courseDetail.passcodeLabel")}: {course.passcode}</span>
                                    </Badge>
                                  )}
                                </div>
                                <CourseTeacherAvatarGroup
                                  leadLabel={t("common.lead")}
                                  leadTeacher={{
                                    teacherId: course.teacherId,
                                    teacherName: course.teacherName,
                                    teacherAvatar: course.teacherAvatar || "",
                                  }}
                                  teachers={getCourseTeacherItems(course)}
                                  className="mt-2"
                                />
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                                  <Info className="h-3.5 w-3.5" />
                                  <span>{course.description || t("courseDetail.noDescription")}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 font-medium text-foreground/80">
                                    <Users className="h-3.5 w-3.5 text-primary" />
                                    {locale === "zh-CN" ? "学生" : "Students"}: {studentPreview.total}
                                  </span>
                                  {studentPreview.preview.length > 0 ? (
                                    <span className="truncate">
                                      {studentPreview.preview.join(", ")}
                                      {studentPreview.total > studentPreview.preview.length ? ` +${studentPreview.total - studentPreview.preview.length}` : ""}
                                    </span>
                                  ) : (
                                    <span>{t("courseDetail.noAssignedStudents")}</span>
                                  )}
                                  {studentPreview.groupCount > 0 && (
                                    <Badge variant="outline" className="h-5 border-primary/15 bg-primary/5 text-[10px] text-primary">
                                      {locale === "zh-CN" ? `含学生组 ${studentPreview.groupCount} 人` : `${studentPreview.groupCount} from groups`}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Quick Invite Links */}
                            <div className="mt-3 bg-muted/20 border border-border/40 rounded-xl p-3 text-xs space-y-2">
                              <div className="flex items-center gap-1.5 font-medium text-primary">
                                <LinkIcon className="h-3.5 w-3.5" />
                                <span>{t("teacherDashboard.quickInvite")}</span>
                              </div>
                              {Boolean(
                                course.activeCourseShareLinks?.length ||
                                  course.activeJoinLinks?.length
                              ) ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {course.activeCourseShareLinks?.map((link) => (
                                    <Button
                                      key={link.id}
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-lg"
                                      onClick={() => void copyShareUrl(link.courseShareUrl)}
                                    >
                                      <BookOpen className="h-3 w-3 mr-1" />
                                      <span>{link.label.trim() ? link.label.slice(0, 14) : t("common.unknown")}</span>
                                      {link.useCount ? <span className="ml-1 opacity-70">· {link.useCount}</span> : ""}
                                    </Button>
                                  ))}
                                  {course.activeJoinLinks?.map((link) => (
                                    <Button
                                      key={link.id}
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-lg"
                                      onClick={() => void copyShareUrl(link.joinUrl)}
                                    >
                                      <PlayCircle className="h-3 w-3 mr-1" />
                                      <span>{link.label.trim() ? link.label.slice(0, 14) : t("common.unknown")}</span>
                                      {link.useCount ? <span className="ml-1 opacity-70">· {link.useCount}</span> : ""}
                                    </Button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">{t("teacherDashboard.inviteLinkEmpty")}</p>
                              )}
                            </div>

                            {course.studentRemarks && (
                              <div className="text-xs bg-blue-500/5 border border-blue-500/20 p-3 rounded-xl text-blue-800 dark:text-blue-200 mt-2">
                                <strong className="text-blue-600 dark:text-blue-300 mr-1">{t("studentDashboard.myRemarks")}</strong> {course.studentRemarks}
                              </div>
                            )}
                          </div>

                          {/* Footer Actions */}
                          <div className="mt-5 pt-4 border-t border-border/40 flex flex-wrap justify-between items-center gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5 rounded-lg"
                              onClick={() => router.push(`/courses/${course.id}`)}
                            >
                              <Info className="h-4 w-4" />
                              <span>{t("teacherDashboard.btnDetails")}</span>
                            </Button>

                            <div className="flex items-center gap-2">
                              {canEnterClassroom(course.status) && (
                                <div className="flex items-center gap-1 mr-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-xs text-emerald-600 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-lg" 
                                    onClick={() => handleStatusChange(course.id, CourseStatus.FINISHED)}
                                  >
                                    {t("teacherDashboard.btnFinish")}
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-xs text-red-500 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 rounded-lg" 
                                    onClick={() => handleStatusChange(course.id, CourseStatus.CANCELLED)}
                                  >
                                    {t("common.cancel")}
                                  </Button>
                                </div>
                              )}

                              <Button 
                                disabled={enteringCourseId === course.id || (course.status === "finished" ? !course.recordUrl : !canEnterClassroom(course.status))}
                                className={`rounded-xl px-5 py-2.5 font-medium shadow-sm text-sm active:scale-[0.98] transition-all flex items-center gap-1.5 ${
                                  course.status === "finished"
                                    ? "bg-muted text-foreground border border-border/80 hover:bg-muted/80"
                                    : "bg-primary hover:bg-primary/95 text-white"
                                }`}
                                onClick={() => {
                                  if (course.status === "finished") {
                                    if (course.recordUrl) window.open(course.recordUrl, "_blank");
                                  } else {
                                    void handleEnterClassroomFromList(course);
                                  }
                                }}
                              >
                                {enteringCourseId === course.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                                    <span>{t("teacherDashboard.btnEntering")}</span>
                                  </>
                                ) : course.status === "finished" ? (
                                  <>
                                    <PlayCircle className="h-4.5 w-4.5 text-current" />
                                    <span>{course.recordUrl ? t("studentDashboard.viewPlayback") : t("studentDashboard.livePlayback")}</span>
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="h-4.5 w-4.5 text-current" />
                                    <span>{t("teacherDashboard.btnEnterClass")}</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
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

        {/* ──── Student Management Page ──── */}
        {activePage === "students" && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">{t("teacherDashboard.studentManage")}</h2>
              <p className="text-muted-foreground mt-1 text-sm font-medium">{t("teacherDashboard.searchDesc")}</p>
            </div>

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
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px] bg-card border border-border/80 rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{t("teacherDashboard.createTitle")}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">{t("teacherDashboard.createDesc")}</DialogDescription>
            </DialogHeader>

            {createError && (
              <div className="text-xs text-red-500 bg-red-500/5 p-3 rounded-xl border border-red-500/20">{createError}</div>
            )}

            <div className="space-y-4 py-2">
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
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.fieldDesc")} <span className="text-muted-foreground text-xs">({t("common.cancel")})</span></label>
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
                      if (open) {
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
                      onClick={() => void fetchCreateTeacherOptions()}
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

              <div className="space-y-4 flex flex-col sm:flex-row gap-4 sm:space-y-0">
                <div className="space-y-2 flex-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> {t("teacherDashboard.fieldStartTime")} <span className="text-red-400">*</span>
                  </label>
                  <Input
                    className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 cursor-pointer rounded-xl h-11 px-4 text-sm font-medium transition-all shadow-inner"
                    type="datetime-local"
                    min={minDateTime}
                    value={createStartTime}
                    onChange={(e) => { setCreateStartTime(e.target.value); setCreateError(""); }}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker?.(); } catch {}
                    }}
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> {t("teacherDashboard.fieldEndTime")} <span className="text-red-400">*</span>
                  </label>
                  <Input
                    className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 cursor-pointer rounded-xl h-11 px-4 text-sm font-medium transition-all shadow-inner"
                    type="datetime-local"
                    min={createStartTime || minDateTime}
                    value={createEndTime}
                    onChange={(e) => { setCreateEndTime(e.target.value); setCreateError(""); }}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker?.(); } catch {}
                    }}
                  />
                </div>
              </div>

              {/* Timezone Conversion Helper */}
              <div className="bg-primary/5 border border-primary/10 p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Globe className="h-3.5 w-3.5" />
                    <span>{locale === "zh-CN" ? "多国时间对照 (排课辅助)" : "Timezone Comparison (Scheduling Help)"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTzConfig(!showTzConfig)}
                    className="text-[11px] text-primary hover:underline font-medium transition-all"
                  >
                    {showTzConfig 
                      ? (locale === "zh-CN" ? "收起设定" : "Hide Settings") 
                      : (locale === "zh-CN" ? "设定国家" : "Set Countries")}
                  </button>
                </div>

                {showTzConfig && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-background rounded-lg border border-border/60 animate-in fade-in duration-200">
                    {SUPPORTED_TIMEZONES.map((tz) => {
                      const isSelected = selectedTzIds.includes(tz.id);
                      return (
                        <button
                          key={tz.id}
                          type="button"
                          onClick={() => handleTzToggle(tz.id)}
                          className={`flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-full border transition-all ${
                            isSelected
                              ? "bg-primary/10 border-primary/35 text-primary font-medium"
                              : "bg-muted border-border/60 text-muted-foreground hover:border-border"
                          }`}
                        >
                          <span>{tz.flag}</span>
                          <span>{locale === "zh-CN" ? tz.nameCN : tz.nameEN}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedTzIds.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2 italic">
                    {locale === "zh-CN" ? "请设定需要对比的国家以进行对照" : "Please select countries to compare times."}
                  </p>
                ) : !createStartTime ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2 italic">
                    {locale === "zh-CN" ? "请选择上课时间以自动对照其他国家时间" : "Please select start time to display multi-country times."}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {convertedTimes.map((item) => (
                      <div key={item.id} className="bg-background border border-border/60 rounded-lg p-2 flex flex-col justify-center hover:border-primary/20 transition-all">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-primary">
                            <span>{item.flag}</span>
                            <span>{locale === "zh-CN" ? item.nameCN : item.nameEN}</span>
                          </span>
                          <span className="text-[9px] bg-primary/5 px-1 rounded text-primary font-mono">{item.offset}</span>
                        </div>
                        <div className="text-[11px] font-semibold text-foreground mt-1 truncate">
                          {item.convertedTime}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                      <span>{locale === "zh-CN" ? "无需密码，直接进入" : "Open entry"}</span>
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
                      <span>{locale === "zh-CN" ? "需要 Passcode" : "Require passcode"}</span>
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

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" className="rounded-xl text-xs" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button
                className="bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-semibold shadow-sm active:scale-[0.98]"
                onClick={handleCreateCourse}
                disabled={
                  createLoading ||
                  !createName.trim() ||
                  !createStartTime ||
                  !createEndTime
                }
              >
                {createLoading ? t("common.saving") : t("teacherDashboard.btnCreateCourse")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
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
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight">{t("settingsPanel.title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm font-medium">{t("settingsPanel.desc")}</p>
      </div>

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
