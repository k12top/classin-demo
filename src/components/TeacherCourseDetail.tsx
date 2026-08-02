"use client";

import { useState, useEffect, useCallback, useRef, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Clock, Users, Link as LinkIcon, MessageSquare, Search, Trash2, Info, Check, Copy, BookOpen, FileText, Loader2, Key, User, Pencil, X, RefreshCw, AlertCircle, Upload, CalendarClock, ChevronLeft, ChevronRight, Share2, Send } from "lucide-react";
import { CourseStatusBadge } from "@/components/CourseStatusBadge";
import { useTranslation } from "@/lib/i18n/context";
import TimeDisplay from "@/components/TimeDisplay";
import workspaceStyles from "@/components/portal/course-workspace.module.css";
import { usePortalFeedback } from "@/components/portal/portal-feedback";
import {
  getTeacherDirectory,
  type TeacherDirectoryEntry,
} from "@/lib/teacher-directory-client";
import type { AuthUser } from "@/lib/auth-context";
import {
  CourseSessionManager,
  type CourseSessionItem,
} from "@/components/course-sessions/course-session-manager";

const ROOM_TYPE_KEYS: Record<number, string> = {
  0: "common.roomType1v1",
  4: "common.roomTypeSmall",
  2: "common.roomTypeBig",
  10: "common.roomTypePublic",
};

interface GroupNode {
  id: string;
  name: string;
  members: { userId: string; userName?: string; userAvatar?: string }[];
  children?: GroupNode[];
}

interface CourseTeacherSummary {
  id?: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
}

type UserSearchResult = TeacherDirectoryEntry;

interface CourseStudentSummary {
  id?: string;
  studentId: string;
  studentName: string;
  studentAvatar?: string;
}

interface CourseGroupLinkSummary {
  id: string;
  group: GroupNode;
}

interface CoursewareItem {
  id: string;
  name: string;
  ext: string;
  size?: number;
  taskStatus: string;
  downloadUrl: string;
}

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  studentAvatar?: string;
  sessionCount: number;
  firstEnteredAt: string;
  latestEnteredAt: string;
  lastActivityAt: string | null;
  totalDurationSec: number;
  online: boolean;
  closedByCourseEnd: boolean;
}

type AttendanceApiResponse = {
  attendance?: AttendanceRecord[];
  error?: string;
  code?: string;
};

const ATTENDANCE_REQUEST_TIMEOUT_MS = 12_000;
const ATTENDANCE_RETRY_DELAYS_MS = [350, 900];

function isRetryableAttendanceStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchAttendanceWithTimeout(
  url: string,
  parentSignal: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    ATTENDANCE_REQUEST_TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

function waitForAttendanceRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

interface CourseJoinLinkSummary {
  id: string;
  purpose: "course" | "live";
  label: string;
  status: string;
  useCount: number;
  expiresAt?: string | null;
  shareUrl?: string | null;
  joinUrl?: string | null;
  courseShareUrl?: string | null;
  requiresPasscode?: boolean;
  passcode?: string | null;
}

interface TeacherCourse {
  id: string;
  name: string;
  description: string;
  roomType: number;
  courseKind?: "series" | "standalone";
  passcode?: string | null;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
  teachers?: CourseTeacherSummary[];
  isCourseOwner?: boolean;
  canTeach?: boolean;
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  recordUrl?: string | null;
  students: CourseStudentSummary[];
  groupLinks: CourseGroupLinkSummary[];
  sessionCount?: number;
  completedSessionCount?: number;
  nextSession?: {
    id: string;
    title?: string;
    status: string;
    startTime: string;
    endTime: string;
  } | null;
  sessions?: CourseSessionItem[];
}

function countNestedMembers(g: GroupNode): number {
  let n = g.members?.length ?? 0;
  for (const c of g.children ?? []) {
    n += countNestedMembers(c);
  }
  return n;
}

function flattenGroups(roots: GroupNode[], prefix = ""): { id: string; label: string }[] {
  const rows: { id: string; label: string }[] = [];
  for (const g of roots) {
    const label = prefix ? `${prefix} / ${g.name}` : g.name;
    rows.push({ id: g.id, label });
    if (g.children?.length) {
      rows.push(...flattenGroups(g.children, label));
    }
  }
  return rows;
}

function createClientPasscode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function formatAttendanceDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export default function TeacherCourseDetail({ 
  course, 
  user,
  onEnterClassroom,
  enterLoading,
  fetchCourse
}: { 
  course: TeacherCourse;
  user?: AuthUser | null;
  onEnterClassroom: () => void;
  enterLoading: boolean;
  fetchCourse: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { notify, confirmAction } = usePortalFeedback();
  const isCourseOwner = Boolean(course.isCourseOwner);
  const defaultJoinLinkPasscode =
    course.roomType === 10 && course.passcode ? course.passcode : "";
  const [isEditingCourseName, setIsEditingCourseName] = useState(false);
  const [courseNameDraft, setCourseNameDraft] = useState("");
  const [courseNameSaving, setCourseNameSaving] = useState(false);
  const [courseNameError, setCourseNameError] = useState("");
  const [activeTab, setActiveTab] = useState("sessions");
  const tabsScrollerRef = useRef<HTMLDivElement>(null);
  const [tabScrollState, setTabScrollState] = useState({
    canScrollBack: false,
    canScrollForward: false,
  });

  // Teaching teachers
  const [teacherResults, setTeacherResults] = useState<UserSearchResult[]>([]);
  const [teacherSearching, setTeacherSearching] = useState(false);
  const [teacherError, setTeacherError] = useState("");
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [selectedTeachers, setSelectedTeachers] = useState<CourseTeacherSummary[]>([]);
  const [primaryTeacherId, setPrimaryTeacherId] = useState("");

  // Search / add students
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Groups
  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  // Links
  const [joinLinks, setJoinLinks] = useState<CourseJoinLinkSummary[]>([]);
  const [joinLinkBusy, setJoinLinkBusy] = useState(false);
  const [newCourseLinkLabel, setNewCourseLinkLabel] = useState("");
  const [newLiveLinkLabel, setNewLiveLinkLabel] = useState("");
  const [newCourseRequirePasscode, setNewCourseRequirePasscode] = useState(
    Boolean(defaultJoinLinkPasscode)
  );
  const [newLiveRequirePasscode, setNewLiveRequirePasscode] = useState(
    Boolean(defaultJoinLinkPasscode)
  );
  const [newCoursePasscode, setNewCoursePasscode] = useState(
    defaultJoinLinkPasscode
  );
  const [newLivePasscode, setNewLivePasscode] = useState(
    defaultJoinLinkPasscode
  );
  const [copyHint, setCopyHint] = useState("");
  const [joinLinkError, setJoinLinkError] = useState("");

  // Courseware Tab State
  const [courseware, setCourseware] = useState<CoursewareItem[]>([]);
  const [cwName, setCwName] = useState("");
  const [cwFile, setCwFile] = useState<File | null>(null);
  const [cwAdding, setCwAdding] = useState(false);
  const [cwError, setCwError] = useState("");
  const cwFileInputRef = useRef<HTMLInputElement>(null);

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const attendanceRequestIdRef = useRef(0);
  const attendanceAbortRef = useRef<AbortController | null>(null);

  const updateTabScrollState = useCallback(() => {
    const scroller = tabsScrollerRef.current;
    if (!scroller) return;
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    setTabScrollState({
      canScrollBack: scroller.scrollLeft > 2,
      canScrollForward: scroller.scrollLeft < maxScrollLeft - 2,
    });
  }, []);

  const scrollTabs = (direction: "back" | "forward") => {
    const scroller = tabsScrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction === "back" ? -Math.max(180, scroller.clientWidth * 0.62) : Math.max(180, scroller.clientWidth * 0.62),
      behavior: "smooth",
    });
  };

  const handleTabsWheel = (event: WheelEvent<HTMLDivElement>) => {
    const scroller = tabsScrollerRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    scroller.scrollLeft += event.deltaY;
  };

  useEffect(() => {
    const scroller = tabsScrollerRef.current;
    if (!scroller) return;
    const frame = window.requestAnimationFrame(updateTabScrollState);
    const observer = new ResizeObserver(updateTabScrollState);
    observer.observe(scroller);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [course.roomType, isCourseOwner, locale, updateTabScrollState]);

  useEffect(() => {
    const scroller = tabsScrollerRef.current;
    if (!scroller) return;
    const frame = window.requestAnimationFrame(() => {
      const activeTrigger = scroller.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]',
      );
      activeTrigger?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      updateTabScrollState();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, updateTabScrollState]);

  const sameTeacherId = (a: string, b: string) => {
    if (a === b) return true;
    const strip = (value: string) => (value.includes("/") ? value.split("/").pop() || value : value);
    return strip(a) === strip(b);
  };

  const baseCourseTeachers = useCallback((): CourseTeacherSummary[] => {
    const teachers =
      Array.isArray(course.teachers) && course.teachers.length > 0
        ? course.teachers
        : [{ teacherId: course.teacherId, teacherName: course.teacherName, teacherAvatar: course.teacherAvatar }];
    const normalized: CourseTeacherSummary[] = [];
    for (const teacher of teachers) {
      const teacherId = teacher.teacherId?.trim();
      if (!teacherId) continue;
      if (normalized.some((item) => sameTeacherId(item.teacherId, teacherId))) {
        continue;
      }
      normalized.push({
        id: teacher.id,
        teacherId,
        teacherName: teacher.teacherName || teacherId,
        teacherAvatar: teacher.teacherAvatar || "",
      });
    }
    return normalized.length
      ? normalized
      : [{ teacherId: course.teacherId, teacherName: course.teacherName, teacherAvatar: course.teacherAvatar || "" }];
  }, [course.teacherAvatar, course.teacherId, course.teacherName, course.teachers]);

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedTeachers(baseCourseTeachers());
      setPrimaryTeacherId(course.teacherId);
      setTeacherResults([]);
      setTeacherError("");
    });
  }, [baseCourseTeachers, course.teacherId]);


  useEffect(() => {
    queueMicrotask(() => {
      setNewCourseRequirePasscode(Boolean(defaultJoinLinkPasscode));
      setNewLiveRequirePasscode(Boolean(defaultJoinLinkPasscode));
      setNewCoursePasscode(defaultJoinLinkPasscode);
      setNewLivePasscode(defaultJoinLinkPasscode);
    });
  }, [course.id, defaultJoinLinkPasscode]);

  const makeTeacherFromSearchResult = (u: UserSearchResult): CourseTeacherSummary => ({
    teacherId: u.casdoorUuid || u.id,
    teacherName: u.displayName || u.name || u.email || u.id,
    teacherAvatar: u.avatar || "",
  });

  const teacherInitial = (teacher: Pick<CourseTeacherSummary, "teacherName" | "teacherId">) =>
    (teacher.teacherName || teacher.teacherId || "T").trim().slice(0, 1).toUpperCase();

  const addSelectedTeacher = (teacher: CourseTeacherSummary) => {
    setSelectedTeachers((prev) => {
      if (prev.some((item) => sameTeacherId(item.teacherId, teacher.teacherId))) {
        return prev;
      }
      return [...prev, teacher];
    });
  };

  const removeSelectedTeacher = (teacherId: string) => {
    setSelectedTeachers((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((item) => !sameTeacherId(item.teacherId, teacherId));
      if (sameTeacherId(primaryTeacherId, teacherId)) {
        setPrimaryTeacherId(next[0]?.teacherId || "");
      }
      return next;
    });
  };

  const fetchTeacherOptions = useCallback(async (force = false) => {
    setTeacherSearching(true);
    setTeacherError("");
    try {
      const teachers = await getTeacherDirectory({ force });
      setTeacherResults(teachers);
      if (!teachers.length) {
        setTeacherError(t("teacherDashboard.searchUserNotFound"));
      }
    } catch (error) {
      setTeacherError(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setTeacherSearching(false);
    }
  }, [t]);

  const handleSelectTeacher = (teacherId: string) => {
    const result = teacherResults.find((item) => {
      const teacher = makeTeacherFromSearchResult(item);
      return sameTeacherId(teacher.teacherId, teacherId);
    });
    if (!result) return;
    addSelectedTeacher(makeTeacherFromSearchResult(result));
  };

  useEffect(() => {
    if (!isCourseOwner) return;
    queueMicrotask(() => {
      void fetchTeacherOptions();
    });
  }, [fetchTeacherOptions, isCourseOwner]);

  const handleSaveTeachers = async () => {
    const primaryTeacher =
      selectedTeachers.find((teacher) => sameTeacherId(teacher.teacherId, primaryTeacherId)) ||
      selectedTeachers[0];
    if (!primaryTeacher) {
      setTeacherError(t("courseDetail.atLeastOneTeacherRequired"));
      return;
    }

    setTeacherSaving(true);
    setTeacherError("");
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          primaryTeacher,
          teachers: selectedTeachers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("common.failed"));
      }
      await fetchCourse();
    } catch (error) {
      setTeacherError(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setTeacherSaving(false);
    }
  };

  const fetchCourseware = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${course.id}/courseware`);
      if (res.ok) {
        const data = await res.json();
        setCourseware(data.courseware ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch courseware:", e);
    }
  }, [course.id]);

  useEffect(() => {
    if (course.canTeach) {
      queueMicrotask(() => {
        void fetchCourseware();
      });
    }
  }, [course.canTeach, fetchCourseware]);

  const handleAddCourseware = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cwFile) {
      setCwError(t("courseDetail.coursewareFileRequired"));
      return;
    }
    const fileName = cwName.trim() || cwFile.name;
    const extension = cwFile.name.split(".").pop()?.toLowerCase() || "";
    if (!extension) {
      setCwError(t("courseDetail.coursewareExtensionRequired"));
      return;
    }
    
    setCwAdding(true);
    setCwError("");
    try {
      const uploadUrlRes = await fetch(`/api/courses/${course.id}/courseware/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: cwFile.name,
          contentType: cwFile.type || "application/octet-stream",
          size: cwFile.size,
        }),
      });
      const uploadUrlData = await uploadUrlRes.json();
      if (!uploadUrlRes.ok) {
        throw new Error(uploadUrlData.error || t("courseDetail.errCwAddFailed"));
      }

      const uploadRes = await fetch(uploadUrlData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadUrlData.contentType },
        body: cwFile,
      });
      if (!uploadRes.ok) {
        throw new Error(t("courseDetail.coursewareOssUploadFailed"));
      }

      const res = await fetch(`/api/courses/${course.id}/courseware`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fileName,
          objectKey: uploadUrlData.objectKey,
          ext: extension,
          size: cwFile.size,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("courseDetail.errCwAddFailed"));
      }
      
      setCwName("");
      setCwFile(null);
      if (cwFileInputRef.current) cwFileInputRef.current.value = "";
      setCwError("");
      await fetchCourseware();
    } catch (err) {
      setCwError(err instanceof Error ? err.message : t("courseDetail.errCwAddFailed"));
    } finally {
      setCwAdding(false);
    }
  };

  /** 一对一 (roomType 0) 仅支持直配学生，不使用学生组。 */
  const supportsStudentGroups = course.roomType !== 0;

  const fetchMyGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  const fetchJoinLinks = useCallback(async () => {
    const res = await fetch(`/api/courses/${course.id}/join-links`, {
      credentials: "same-origin",
    });
    if (res.ok) {
      const data = await res.json();
      setJoinLinks(data.links ?? []);
    }
  }, [course.id]);

  useEffect(() => {
    if (isCourseOwner) {
      queueMicrotask(() => {
        if (supportsStudentGroups) void fetchMyGroups();
        void fetchJoinLinks();
      });
    }
  }, [
    course.roomType,
    fetchMyGroups,
    fetchJoinLinks,
    isCourseOwner,
    supportsStudentGroups,
  ]);

  const copyText = async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setJoinLinkError("");
      setCopyHint(hint);
      setTimeout(() => setCopyHint(""), 2000);
    } catch {
      setCopyHint(t("courseDetail.copyFailed"));
    }
  };

  const courseInvitationText = (link: CourseJoinLinkSummary, url: string) => {
    const passcodeLine = link.passcode
      ? `\n${t("courseDetail.invitationPasscode", { passcode: link.passcode })}`
      : "";
    return t("courseDetail.invitationTemplate", {
      course: course.name,
      url,
      passcodeLine,
    });
  };

  const shareCourseInvitation = async (link: CourseJoinLinkSummary, url: string) => {
    const text = courseInvitationText(link, url);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: t("courseDetail.invitationTitle", { course: course.name }),
          text,
          url,
        });
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
      }
    }
    await copyText(text, t("courseDetail.invitationCopied"));
  };

  const handleCreateJoinLink = async (purpose: "course" | "live") => {
    const label =
      purpose === "course" ? newCourseLinkLabel.trim() : newLiveLinkLabel.trim();
    const requirePasscode =
      purpose === "course" ? newCourseRequirePasscode : newLiveRequirePasscode;
    const passcode =
      purpose === "course" ? newCoursePasscode.trim() : newLivePasscode.trim();
    if (requirePasscode && passcode && !/^\d{6}$/.test(passcode)) {
      setCopyHint("");
      setJoinLinkError(t("teacherDashboard.errPasscodeInvalid"));
      return;
    }
    setJoinLinkError("");
    setJoinLinkBusy(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/join-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          purpose,
          label: label || undefined,
          requirePasscode,
          passcode: requirePasscode && passcode ? passcode : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (purpose === "course") {
          setNewCourseLinkLabel("");
        } else {
          setNewLiveLinkLabel("");
        }
        await fetchJoinLinks();
        const url = data.link?.shareUrl || data.link?.courseShareUrl || data.link?.joinUrl;
        if (url) {
          await copyText(url, t("courseDetail.shareLinkCreatedAndCopied"));
        }
      } else {
        setJoinLinkError(
          typeof data.error === "string" ? data.error : t("common.failed")
        );
      }
    } finally {
      setJoinLinkBusy(false);
    }
  };

  const handleRevokeJoinLink = async (linkId: string) => {
    if (
      !(await confirmAction({
        description: t("courseDetail.confirmRevokeLink"),
        tone: "danger",
      }))
    ) return;
    setJoinLinkBusy(true);
    try {
      await fetch(`/api/courses/${course.id}/join-links/${linkId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await fetchJoinLinks();
    } finally {
      setJoinLinkBusy(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSearchResults(data.users ?? []);
        if (!data.users?.length) {
          setSearchError(t("teacherDashboard.searchUserNotFound"));
        }
      } else {
        setSearchResults([]);
        setSearchError(data.hint || data.error || `${t("common.failed")} (${res.status})`);
      }
    } catch {
      setSearchResults([]);
      setSearchError(t("common.failed"));
    } finally {
      setSearching(false);
    }
  };

  const handleSaveCourseName = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = courseNameDraft.trim();
    if (!nextName) {
      setCourseNameError(t("courseDetail.courseNameRequired"));
      return;
    }
    if (nextName === course.name) {
      setIsEditingCourseName(false);
      return;
    }

    setCourseNameSaving(true);
    setCourseNameError("");
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || t("courseDetail.courseNameSaveFailed")
        );
      }
      setIsEditingCourseName(false);
      setCourseNameDraft(nextName);
      await fetchCourse();
    } catch (error) {
      setCourseNameError(
        error instanceof Error
          ? error.message
          : t("courseDetail.courseNameSaveFailed")
      );
    } finally {
      setCourseNameSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      attendanceRequestIdRef.current += 1;
      attendanceAbortRef.current?.abort();
    };
  }, []);

  const fetchAttendance = useCallback(async () => {
    attendanceAbortRef.current?.abort();
    const requestController = new AbortController();
    attendanceAbortRef.current = requestController;
    const requestId = ++attendanceRequestIdRef.current;
    const requestUrl = `/api/courses/${course.id}/attendance`;
    const unavailableMessage = t("courseDetail.attendanceUnavailable");

    setAttendanceLoading(true);
    setAttendanceError("");

    try {
      let lastError = new Error(unavailableMessage);

      for (let attempt = 0; attempt <= ATTENDANCE_RETRY_DELAYS_MS.length; attempt += 1) {
        if (requestController.signal.aborted) return;
        let shouldRetry = true;

        try {
          let res = await fetchAttendanceWithTimeout(
            requestUrl,
            requestController.signal
          );

          if (res.status === 401) {
            const refreshed = await tryOAuthRefresh();
            if (!refreshed) {
              redirectToSsoLogin();
              return;
            }
            res = await fetchAttendanceWithTimeout(
              requestUrl,
              requestController.signal
            );
          }

          const data = (await res.json().catch(() => ({}))) as AttendanceApiResponse;
          if (res.ok) {
            if (!Array.isArray(data.attendance)) {
              throw new Error(unavailableMessage);
            }
            if (requestId === attendanceRequestIdRef.current) {
              setAttendance(data.attendance);
            }
            return;
          }

          if (res.status === 401) {
            redirectToSsoLogin();
            return;
          }

          const responseMessage =
            res.status === 403
              ? t("courseDetail.attendanceForbidden")
              : isRetryableAttendanceStatus(res.status)
                ? unavailableMessage
                : data.error || unavailableMessage;
          lastError = new Error(responseMessage);

          if (!isRetryableAttendanceStatus(res.status)) {
            shouldRetry = false;
            throw lastError;
          }
        } catch (error) {
          if (requestController.signal.aborted) return;
          lastError =
            error instanceof Error ? error : new Error(unavailableMessage);
          if (!shouldRetry) {
            throw lastError;
          }
        }

        const retryDelay = ATTENDANCE_RETRY_DELAYS_MS[attempt];
        if (retryDelay === undefined) {
          throw lastError;
        }
        await waitForAttendanceRetry(retryDelay);
      }
    } catch (error) {
      if (requestId === attendanceRequestIdRef.current) {
        setAttendanceError(
          error instanceof Error ? error.message : unavailableMessage
        );
      }
    } finally {
      if (requestId === attendanceRequestIdRef.current) {
        setAttendanceLoading(false);
        attendanceAbortRef.current = null;
      }
    }
  }, [course.id, t]);

  const exportAttendanceCsv = () => {
    window.location.href = `/api/courses/${course.id}/attendance?format=csv`;
  };

  const handleAddStudent = async (student: UserSearchResult) => {
    try {
      const res = await fetch(`/api/courses/${course.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: [
            {
              studentId: student.id,
              studentName: student.displayName || student.name,
              studentAvatar: student.avatar || "",
            },
          ],
        }),
      });
      if (res.ok) {
        fetchCourse();
        setSearchResults((prev) => prev.filter((u) => u.id !== student.id));
      }
    } catch { }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (
      !(await confirmAction({
        description: t("courseDetail.confirmRemoveStudent"),
        tone: "danger",
      }))
    ) return;
    try {
      await fetch(`/api/courses/${course.id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      fetchCourse();
    } catch { }
  };

  const linkedGroupIdSet = new Set(course.groupLinks.map((l) => l.group.id));

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

  const handleLinkGroupToCourse = async (groupId: string) => {
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "linkToCourse",
          groupId,
          courseId: course.id,
        }),
      });
      if (res.ok) await fetchCourse();
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
      if (res.ok) {
        await fetchMyGroups();
        await fetchCourse();
      }
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

  const courseShareLinks = joinLinks.filter((link) => link.purpose === "course");
  const liveJoinLinks = joinLinks.filter((link) => link.purpose !== "course");
  const sharingText = {
    courseTitle: t("courseDetail.courseShareTitle"),
    courseDesc: t("courseDetail.courseShareDescription"),
    liveTitle: t("courseDetail.liveShareTitle"),
    liveDesc: t("courseDetail.liveShareDescription"),
    coursePlaceholder: t("courseDetail.courseSharePlaceholder"),
    livePlaceholder: t("courseDetail.liveSharePlaceholder"),
    requirePasscode: t("courseDetail.requirePasscode"),
    passcodePlaceholder: t("courseDetail.passcodeAutoPlaceholder"),
    generatePasscode: t("courseDetail.generatePasscode"),
    passcodeProtected: t("courseDetail.passcodeProtected"),
    copyPasscode: t("courseDetail.copyPasscode"),
    copyInvitation: t("courseDetail.copyInvitation"),
    systemShare: t("courseDetail.systemShare"),
    courseEmpty: t("courseDetail.courseShareEmpty"),
    liveEmpty: t("courseDetail.liveShareEmpty"),
    activeCourseLinks: t("courseDetail.activeCourseLinks"),
    activeLiveLinks: t("courseDetail.activeLiveLinks"),
  };

  const renderPasscodeControls = ({
    enabled,
    passcode,
    setEnabled,
    setPasscode,
  }: {
    enabled: boolean;
    passcode: string;
    setEnabled: (enabled: boolean) => void;
    setPasscode: (passcode: string) => void;
  }) => (
    <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <label className="flex items-center justify-between gap-3 text-xs font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5 text-primary" />
          {sharingText.requirePasscode}
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            const checked = event.target.checked;
            setEnabled(checked);
            if (checked && !passcode) {
              setPasscode(defaultJoinLinkPasscode || createClientPasscode());
            }
          }}
          className="h-4 w-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>
      {enabled ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            className="bg-background border-border/80 font-mono text-sm tracking-widest rounded-xl"
            placeholder={sharingText.passcodePlaceholder}
            value={passcode}
            maxLength={6}
            inputMode="numeric"
            onChange={(event) => {
              setPasscode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setJoinLinkError("");
              setCopyHint("");
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-xl text-xs shrink-0"
            onClick={() => setPasscode(createClientPasscode())}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {sharingText.generatePasscode}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const renderPasscodeMeta = (link: CourseJoinLinkSummary) =>
    link.requiresPasscode ? (
      <p className="flex items-center gap-1.5 text-primary">
        <Key className="h-3.5 w-3.5" />
        <span>
          {sharingText.passcodeProtected}
          {link.passcode ? `: ${link.passcode}` : ""}
        </span>
      </p>
    ) : null;

  const getFileIcon = (ext: string) => {
    const normExt = ext.toLowerCase();
    if (normExt === "pdf") return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
    if (["ppt", "pptx"].includes(normExt)) return <FileText className="h-5 w-5 text-orange-500 shrink-0" />;
    if (["doc", "docx"].includes(normExt)) return <FileText className="h-5 w-5 text-blue-500 shrink-0" />;
    return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  };

  const nextSession = course.nextSession || null;
  const canEnterNextSession = Boolean(
    nextSession && !["finished", "cancelled"].includes(nextSession.status),
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 pt-4">
      {/* Header Card */}
      <Card className={workspaceStyles.hero}>
        <div className="absolute top-[-50%] right-[-10%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <CardContent className={workspaceStyles.heroContent}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-4 flex-1">
              <div className={workspaceStyles.heroTopline}>
                <span className={workspaceStyles.heroEyebrow}>
                  {t("courseDetail.courseControl")}
                </span>
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">
                  {t(
                    course.courseKind === "standalone"
                      ? "portal.standaloneCourse"
                      : "portal.courseGroup",
                  )}
                </Badge>
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">
                  {t(ROOM_TYPE_KEYS[course.roomType]) || t("common.unknown")}
                </Badge>
                <CourseStatusBadge status={course.status} />
                {course.roomType === 10 && course.passcode && (
                  <Badge 
                    variant="outline" 
                    className="border-primary/20 bg-primary/5 text-primary cursor-pointer flex items-center gap-1 hover:bg-primary/10 transition-colors font-mono text-[10px]"
                    onClick={() => void copyText(course.passcode!, t("courseDetail.copyPasscodeSuccess"))}
                    title={t("courseDetail.btnCopy")}
                  >
                    <Key className="h-3 w-3" />
                    <span>{t("courseDetail.passcodeLabel")}: {course.passcode}</span>
                    <Copy className="h-3 w-3 ml-0.5" />
                  </Badge>
                )}
              </div>
              {isEditingCourseName ? (
                <form
                  onSubmit={handleSaveCourseName}
                  className="flex flex-col gap-2 max-w-2xl"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={courseNameDraft}
                      onChange={(e) => {
                        setCourseNameDraft(e.target.value);
                        setCourseNameError("");
                      }}
                      className="h-12 min-w-0 flex-1 rounded-xl border-border/80 bg-background text-xl font-bold md:text-2xl"
                      maxLength={100}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl"
                      disabled={courseNameSaving}
                      title={t("common.save")}
                    >
                      {courseNameSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-10 w-10 shrink-0 rounded-xl"
                      disabled={courseNameSaving}
                      onClick={() => {
                        setCourseNameDraft(course.name || "");
                        setCourseNameError("");
                        setIsEditingCourseName(false);
                      }}
                      title={t("common.cancel")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {courseNameError && (
                    <p className="text-xs text-red-500">{courseNameError}</p>
                  )}
                </form>
              ) : (
                <div className="flex items-start gap-2">
                  <h1 className={`min-w-0 break-words ${workspaceStyles.heroTitle}`}>
                    {course.name}
                  </h1>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="mt-1 h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-primary"
                    onClick={() => {
                      setCourseNameDraft(course.name || "");
                      setCourseNameError("");
                      setIsEditingCourseName(true);
                    }}
                    title={t("common.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-4">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${workspaceStyles.heroPill}`}>
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">
                    {t("common.lead")}: {course.teacherName}
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${workspaceStyles.heroPill}`}>
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">{t("courseDetail.studentCount", { count: course.students.length })}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${workspaceStyles.heroPill}`}>
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">
                    {nextSession ? (
                      <TimeDisplay isoString={nextSession.startTime} options={{ month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }} />
                    ) : t("courseSessions.empty")}
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${workspaceStyles.heroPill}`}>
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <span className="text-foreground/80">
                    {t("courseSessions.progress", {
                      completed: course.completedSessionCount || 0,
                      total: course.sessionCount || 0,
                    })}
                  </span>
                </div>
              </div>
            </div>
            
            <div className={`flex flex-col gap-3 w-full md:w-auto shrink-0 ${workspaceStyles.heroActionPanel}`}>
              <span className={workspaceStyles.heroActionLabel}>
                {t("courseSessions.nextLesson")}
              </span>
              {canEnterNextSession ? (
                <Button
                  size="lg"
                  className={`w-full rounded-xl font-medium active:scale-[0.98] transition-all ${workspaceStyles.primaryAction}`}
                  onClick={onEnterClassroom}
                  disabled={enterLoading}
                >
                  <span className="flex items-center gap-2">
                    {enterLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <PlayCircle className="h-5 w-5" />
                    )}
                    {enterLoading
                      ? t("teacherDashboard.btnEntering")
                      : t("courseSessions.enterLive")}
                  </span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className={`w-full rounded-xl ${workspaceStyles.secondaryAction}`}
                onClick={() => setActiveTab("sessions")}
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                {t("courseSessions.manage")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs Area */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className={`${workspaceStyles.tabsShell} mb-6`}>
          <div
            ref={tabsScrollerRef}
            className={workspaceStyles.tabsScroller}
            onScroll={updateTabScrollState}
            onWheel={handleTabsWheel}
          >
        <TabsList className={workspaceStyles.tabs}>
          <TabsTrigger value="sessions" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap">
            <CalendarClock className="mr-2 h-4 w-4" /> {t("courseSessions.title")}
          </TabsTrigger>
          <TabsTrigger value="members" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap">
            <Users className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.members")}
          </TabsTrigger>
          <TabsTrigger value="teachers" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap">
            <User className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.teachers")}
          </TabsTrigger>
          <TabsTrigger value="courseware" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap">
            <BookOpen className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.coursewareManage")}
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap"
            onClick={() => void fetchAttendance()}
          >
            <Clock className="mr-2 h-4 w-4" /> {t("courseDetail.attendance")}
          </TabsTrigger>
          {isCourseOwner && (
            <TabsTrigger value="sharing" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap">
              <LinkIcon className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.sharing")}
            </TabsTrigger>
          )}
          <TabsTrigger value="requirements" className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm font-medium text-sm whitespace-nowrap">
            <MessageSquare className="mr-2 h-4 w-4" /> {t("courseDetail.tabs.requirementsStudent")}
          </TabsTrigger>
        </TabsList>
          </div>
          <button
            type="button"
            className={`${workspaceStyles.tabsScrollButton} ${workspaceStyles.tabsScrollBack}`}
            data-visible={tabScrollState.canScrollBack}
            disabled={!tabScrollState.canScrollBack}
            onClick={() => scrollTabs("back")}
            aria-label={t("courseDetail.tabsScrollBack")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${workspaceStyles.tabsScrollButton} ${workspaceStyles.tabsScrollForward}`}
            data-visible={tabScrollState.canScrollForward}
            disabled={!tabScrollState.canScrollForward}
            onClick={() => scrollTabs("forward")}
            aria-label={t("courseDetail.tabsScrollForward")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <TabsContent value="sessions" className="mt-0">
          <CourseSessionManager
            courseId={course.id}
            courseName={course.name}
            courseKind={course.courseKind}
            roomType={course.roomType}
            canManage={Boolean(course.canTeach)}
            canManageCourseLifecycle={Boolean(
              course.isCourseOwner ||
                (user && casdoorUserIdsMatch(course.teacherId, user.userId)),
            )}
            currentUserIds={[user?.userId || "", user?.name || ""].filter(Boolean)}
            leadTeacherId={course.teacherId}
            teachers={selectedTeachers}
            students={course.students}
            groupLinks={course.groupLinks}
            initialSessions={course.sessions}
            onManageRoster={(role) =>
              setActiveTab(role === "assistant" ? "teachers" : "members")
            }
          />
        </TabsContent>

        <TabsContent value="teachers" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border border-border/60 bg-card rounded-2xl shadow-sm lg:col-span-2">
              <CardHeader className="border-b border-border/40 pb-4">
                <CardTitle className="text-lg font-bold">
                  {t("courseDetail.teachingTeachersTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("courseDetail.teachingTeachersDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-3">
                {selectedTeachers.map((teacher) => {
                  const isPrimary = sameTeacherId(teacher.teacherId, primaryTeacherId);
                  return (
                    <div
                      key={teacher.teacherId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/10 p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/70">
                          <AvatarImage src={teacher.teacherAvatar || ""} />
                          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                            {teacherInitial(teacher)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-bold">{teacher.teacherName}</span>
                            {isPrimary && (
                              <Badge className="h-5 bg-primary/10 text-primary border border-primary/15 text-[10px]">
                                {t("common.lead")}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">{teacher.teacherId}</p>
                        </div>
                      </div>
                      {isCourseOwner && (
                        <div className="flex items-center gap-2">
                          {!isPrimary && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg text-xs"
                              onClick={() => setPrimaryTeacherId(teacher.teacherId)}
                            >
                              {t("common.makeLeadTeacher")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            disabled={selectedTeachers.length <= 1 || teacherSaving}
                            onClick={() => removeSelectedTeacher(teacher.teacherId)}
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {!isCourseOwner && (
                  <p className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                    {t("courseDetail.teacherOwnerOnly")}
                  </p>
                )}

                {teacherError && (
                  <p className="text-xs text-red-500 bg-red-500/5 p-3 rounded-xl border border-red-500/20">
                    {teacherError}
                  </p>
                )}
              </CardContent>
            </Card>

            {isCourseOwner && (
              <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
                <CardHeader className="border-b border-border/40 pb-4">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Search className="h-5 w-5 text-primary" />
                    {t("courseDetail.addTeacher")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("courseDetail.addTeacherDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Select
                      disabled={teacherSearching}
                      onOpenChange={(open) => {
                        if (open && !teacherResults.length) {
                          void fetchTeacherOptions();
                        }
                      }}
                      onValueChange={handleSelectTeacher}
                    >
                      <SelectTrigger className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl">
                        <SelectValue
                          placeholder={
                            teacherSearching
                              ? t("common.loading")
                              : t("courseDetail.teacherSelectPlaceholder")
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border/85">
                        {teacherResults.map((result) => {
                          const teacher = makeTeacherFromSearchResult(result);
                          const alreadySelected = selectedTeachers.some((item) =>
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
                      className="shrink-0 rounded-xl"
                      disabled={teacherSearching}
                      onClick={() => void fetchTeacherOptions(true)}
                      title={t("courseDetail.teacherSelectPlaceholder")}
                    >
                      {teacherSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <Button
                    type="button"
                    className="w-full rounded-xl bg-primary text-white hover:bg-primary/95"
                    disabled={teacherSaving || selectedTeachers.length === 0}
                    onClick={() => void handleSaveTeachers()}
                  >
                    {teacherSaving ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("common.saving")}
                      </span>
                    ) : (
                      t("courseDetail.saveTeacherSettings")
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-0">
          <div className={`grid grid-cols-1 ${supportsStudentGroups && isCourseOwner ? "lg:grid-cols-2" : ""} gap-6`}>
            {/* Left Side: Direct Students */}
            <Card className="border border-border/60 bg-card flex flex-col h-[600px] rounded-2xl shadow-sm">
              <CardHeader className="border-b border-border/40 pb-4 shrink-0">
                <CardTitle className="text-lg font-bold">{t("courseDetail.userSearchTitle")}</CardTitle>
                <CardDescription className="text-xs">{t("courseDetail.userSearchDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col overflow-hidden h-full">
                <div className="flex gap-2 shrink-0">
                  <Input
                    placeholder={t("teacherDashboard.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                  />
                  <Button 
                    className="bg-primary hover:bg-primary/95 text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all shrink-0" 
                    onClick={handleSearch} 
                    disabled={searching || !searchQuery.trim()}
                  >
                    {searching ? t("teacherDashboard.searching") : t("teacherDashboard.btnSearch")}
                  </Button>
                </div>
                {searchError && <p className="text-xs text-red-500 bg-red-500/5 p-3 mt-3 rounded-xl border border-red-500/20 shrink-0">{searchError}</p>}

                {supportsStudentGroups && isCourseOwner && searchResults.length > 0 && (
                  <div className="mt-4 space-y-2 shrink-0">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("teacherDashboard.addToGroupLabel")}</label>
                    <Select value={memberTargetGroupId} onValueChange={setMemberTargetGroupId}>
                      <SelectTrigger className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl">
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

                {searchResults.length > 0 && (
                  <div className="mt-4 overflow-y-auto pr-2 custom-scrollbar shrink-0 max-h-[150px]">
                    {searchResults.map((u) => {
                      const isAlready = course.students.some((s) => casdoorUserIdsMatch(s.studentId, u.id));
                      return (
                        <div key={u.id} className="flex flex-wrap justify-between items-center p-3 rounded-xl bg-muted/20 border border-border/40 mb-2 gap-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{u.displayName || u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={isAlready ? "outline" : "secondary"}
                              className={isAlready ? "border-border/60 opacity-50 text-xs rounded-lg" : "bg-primary/5 text-primary hover:bg-primary/10 text-xs rounded-lg"}
                              disabled={isAlready}
                              onClick={() => handleAddStudent(u)}
                            >
                              {isAlready ? t("courseDetail.inviteLinkActive") : t("common.add")}
                            </Button>
                            {supportsStudentGroups && isCourseOwner && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-border/60 rounded-lg text-xs"
                                disabled={groupBusy || !memberTargetGroupId}
                                onClick={() => void handleAddUserToGroup(u)}
                              >
                                {t("teacherDashboard.btnAddToGroup")}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6 flex-1 flex flex-col min-h-0">
                  <h4 className="font-bold flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider mb-3 pb-2 border-b border-border/40">
                    {t("courseDetail.assignedStudents")} <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/10">{course.students.length}</Badge>
                  </h4>
                  {course.students.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center border border-dashed border-border/60 rounded-xl text-muted-foreground text-sm bg-muted/10">
                      {t("courseDetail.noAssignedStudents")}
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                      {course.students.map((s) => (
                        <div key={s.id} className="flex justify-between items-center p-3 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/20 transition-all group">
                          <span className="text-sm font-semibold">{s.studentName || s.studentId}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all rounded-md" 
                            onClick={() => handleRemoveStudent(s.studentId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {supportsStudentGroups && isCourseOwner && (
              <Card className="border border-border/60 bg-card flex flex-col h-[600px] rounded-2xl shadow-sm">
                <CardHeader className="border-b border-border/40 pb-4 shrink-0">
                  <CardTitle className="text-lg font-bold">{t("teacherDashboard.studentGroupManage")}</CardTitle>
                  <CardDescription className="text-xs">{t("teacherDashboard.groupManageDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col overflow-hidden h-full">
                  <div className="flex gap-2 shrink-0">
                    <Input
                      placeholder={t("teacherDashboard.newGroupPlaceholder")}
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                      className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                    />
                    <Button variant="secondary" className="shrink-0 rounded-xl text-sm active:scale-[0.98] transition-all" disabled={groupBusy || !newGroupName.trim()} onClick={handleCreateGroup}>
                      {t("teacherDashboard.btnCreate")}
                    </Button>
                  </div>

                  <div className="mt-6 flex-1 flex flex-col min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                    <div>
                      <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-3 pb-2 border-b border-border/40 flex justify-between">
                        {t("teacherDashboard.allMyGroups")} <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/10">{myGroups.length}</Badge>
                      </h4>
                      {myGroups.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-border/60 rounded-xl text-muted-foreground text-sm bg-muted/10">
                          {t("teacherDashboard.groupEmpty")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {myGroups.map((g) => (
                            <div key={g.id} className="flex justify-between items-center p-3 rounded-xl bg-muted/20 border border-border/40">
                              <div className="flex items-center gap-2">
                                <strong className="text-sm font-semibold">{g.name}</strong>
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/10">{countNestedMembers(g)} {t("teacherDashboard.memberCount")}</Badge>
                              </div>
                              <div className="flex gap-2">
                                {!linkedGroupIdSet.has(g.id) && (
                                  <Button size="sm" variant="outline" className="border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 h-7 text-xs rounded-lg font-semibold" disabled={groupBusy} onClick={() => handleLinkGroupToCourse(g.id)}>
                                    {t("courseDetail.btnLinkToCourse")}
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md" disabled={groupBusy} onClick={() => handleDeleteGroup(g.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-3 pb-2 border-b border-border/40 flex justify-between">
                        {t("courseDetail.linkedGroups")} <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/10">{course.groupLinks.length}</Badge>
                      </h4>
                      {course.groupLinks.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-border/60 rounded-xl text-muted-foreground text-sm bg-muted/10">
                          {t("courseDetail.noLinkedGroups")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {course.groupLinks.map((link) => (
                            <div key={link.id} className="rounded-xl bg-primary/5 border border-primary/10 p-3">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <strong className="text-sm font-semibold text-primary">{link.group.name}</strong>
                                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/10">{countNestedMembers(link.group)} {t("teacherDashboard.memberCount")}</Badge>
                                </div>
                                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px]">{t("courseDetail.isLinked")}</Badge>
                              </div>
                              {link.group.members?.length ? (
                                <div className="mt-3 grid gap-2">
                                  {link.group.members.map((member) => (
                                    <div
                                      key={member.userId}
                                      className="flex items-center justify-between rounded-lg border border-primary/10 bg-background/70 px-3 py-2 text-xs"
                                    >
                                      <span className="font-semibold text-foreground">
                                        {member.userName || member.userId}
                                      </span>
                                      <span className="max-w-[220px] truncate text-muted-foreground">
                                        {member.userId}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-3 rounded-lg border border-dashed border-primary/15 bg-background/50 p-3 text-xs text-muted-foreground">
                                  {t("teacherDashboard.groupMemberEmpty")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sharing" className="mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {sharingText.courseTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {sharingText.courseDesc}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                    placeholder={sharingText.coursePlaceholder}
                    value={newCourseLinkLabel}
                    onChange={(e) => setNewCourseLinkLabel(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateJoinLink("course")
                    }
                  />
                  <Button
                    className="bg-primary hover:bg-primary/95 text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all shrink-0 text-xs px-4"
                    disabled={joinLinkBusy}
                    onClick={() => handleCreateJoinLink("course")}
                  >
                    {joinLinkBusy ? t("common.submitting") : t("courseDetail.btnGenerateLink")}
                  </Button>
                </div>
                {renderPasscodeControls({
                  enabled: newCourseRequirePasscode,
                  passcode: newCoursePasscode,
                  setEnabled: setNewCourseRequirePasscode,
                  setPasscode: setNewCoursePasscode,
                })}

                <div className="mt-8">
                  <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/40 flex items-center justify-between">
                    {sharingText.activeCourseLinks}
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/10">{courseShareLinks.length}</Badge>
                  </h4>
                  {courseShareLinks.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-border/60 rounded-xl text-muted-foreground text-sm bg-muted/10">
                      {sharingText.courseEmpty}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {courseShareLinks.map((link) => {
                        const url = link.courseShareUrl || link.shareUrl;
                        return (
                          <div key={link.id} className="p-4 rounded-xl bg-muted/10 border border-border/40 hover:border-primary/20 transition-all flex flex-col h-full group">
                            <div className="flex justify-between items-start mb-2">
                              <strong className="font-semibold text-sm text-foreground">{link.label || t("courseDetail.noLabel")}</strong>
                              <span className={`w-2 h-2 rounded-full ${link.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1 mb-4 flex-1">
                              <p>{t("courseDetail.linkUses", { count: link.useCount })}</p>
                              {renderPasscodeMeta(link)}
                              {link.expiresAt && <p>{t("courseDetail.expiresAtLabel", { date: new Date(link.expiresAt).toLocaleDateString(locale) })}</p>}
                            </div>

                            {link.status === "active" && url && (
                              <div className="flex flex-wrap gap-2 mt-auto">
                                <Button size="sm" className="bg-muted border border-border/60 hover:bg-muted/80 text-foreground rounded-lg text-xs" onClick={() => void copyText(url, t("courseDetail.copySuccess"))}>
                                  <Copy className="h-3.5 w-3.5 mr-1" /> {t("courseDetail.btnCopy")}
                                </Button>
                                <Button size="sm" className="flex-1 bg-primary/10 border border-primary/15 hover:bg-primary/15 text-primary rounded-lg text-xs" onClick={() => void copyText(courseInvitationText(link, url), t("courseDetail.invitationCopied"))}>
                                  <Send className="h-3.5 w-3.5 mr-1" /> {sharingText.copyInvitation}
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => void shareCourseInvitation(link, url)}>
                                  <Share2 className="h-3.5 w-3.5 mr-1" /> {sharingText.systemShare}
                                </Button>
                                {link.passcode && (
                                  <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => void copyText(link.passcode!, t("courseDetail.copyPasscodeSuccess"))}>
                                    <Key className="h-3.5 w-3.5 mr-1" /> {sharingText.copyPasscode}
                                  </Button>
                                )}
                                <Button size="sm" variant="destructive" className="bg-red-500/5 text-red-500 hover:bg-red-500/10 border-0 rounded-lg text-xs" disabled={joinLinkBusy} onClick={() => handleRevokeJoinLink(link.id)}>
                                  {t("courseDetail.btnRevoke")}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-primary" />
                  {sharingText.liveTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {sharingText.liveDesc}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                    placeholder={sharingText.livePlaceholder}
                    value={newLiveLinkLabel}
                    onChange={(e) => setNewLiveLinkLabel(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateJoinLink("live")
                    }
                  />
                  <Button
                    className="bg-primary hover:bg-primary/95 text-white rounded-xl font-medium shadow-sm active:scale-[0.98] transition-all shrink-0 text-xs px-4"
                    disabled={joinLinkBusy}
                    onClick={() => handleCreateJoinLink("live")}
                  >
                    {joinLinkBusy ? t("common.submitting") : t("courseDetail.btnGenerateLink")}
                  </Button>
                </div>
                {renderPasscodeControls({
                  enabled: newLiveRequirePasscode,
                  passcode: newLivePasscode,
                  setEnabled: setNewLiveRequirePasscode,
                  setPasscode: setNewLivePasscode,
                })}

                <div className="mt-8">
                  <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/40 flex items-center justify-between">
                    {sharingText.activeLiveLinks}
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/10">{liveJoinLinks.length}</Badge>
                  </h4>
                  {liveJoinLinks.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-border/60 rounded-xl text-muted-foreground text-sm bg-muted/10">
                      {sharingText.liveEmpty}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {liveJoinLinks.map((link) => {
                        const url = link.joinUrl || link.shareUrl;
                        return (
                          <div key={link.id} className="p-4 rounded-xl bg-muted/10 border border-border/40 hover:border-primary/20 transition-all flex flex-col h-full group">
                            <div className="flex justify-between items-start mb-2">
                              <strong className="font-semibold text-sm text-foreground">{link.label || t("courseDetail.noLabel")}</strong>
                              <span className={`w-2 h-2 rounded-full ${link.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1 mb-4 flex-1">
                              <p>{t("courseDetail.linkUses", { count: link.useCount })}</p>
                              {renderPasscodeMeta(link)}
                              {link.expiresAt && <p>{t("courseDetail.expiresAtLabel", { date: new Date(link.expiresAt).toLocaleDateString(locale) })}</p>}
                            </div>

                            {link.status === "active" && url && (
                              <div className="flex flex-wrap gap-2 mt-auto">
                                <Button size="sm" className="flex-1 bg-muted border border-border/60 hover:bg-muted/80 text-foreground rounded-lg text-xs" onClick={() => void copyText(url, t("courseDetail.copySuccess"))}>
                                  <Copy className="h-3.5 w-3.5 mr-1" /> {t("courseDetail.btnCopy")}
                                </Button>
                                {link.passcode && (
                                  <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => void copyText(link.passcode!, t("courseDetail.copyPasscodeSuccess"))}>
                                    <Key className="h-3.5 w-3.5 mr-1" /> {sharingText.copyPasscode}
                                  </Button>
                                )}
                                <Button size="sm" variant="destructive" className="bg-red-500/5 text-red-500 hover:bg-red-500/10 border-0 rounded-lg text-xs" disabled={joinLinkBusy} onClick={() => handleRevokeJoinLink(link.id)}>
                                  {t("courseDetail.btnRevoke")}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {copyHint && (
              <div className="xl:col-span-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-green-600 dark:text-green-400 text-xs flex items-center gap-2 font-medium">
                <Check className="h-4 w-4" /> {copyHint}
              </div>
            )}
            {joinLinkError && (
              <div className="xl:col-span-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs flex items-center gap-2 font-medium">
                <X className="h-4 w-4" /> {joinLinkError}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="courseware" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Side: Upload / Add Courseware */}
            <Card className="border border-border/60 bg-card rounded-2xl shadow-sm lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg font-bold">{t("courseDetail.addCourseware")}</CardTitle>
                <CardDescription className="text-xs">{t("courseDetail.addCoursewareDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddCourseware} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("courseDetail.coursewareName")}</label>
                    <Input
                      placeholder={t("courseDetail.coursewareNamePlaceholder")}
                      value={cwName}
                      onChange={(e) => setCwName(e.target.value)}
                      className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("courseDetail.chooseCoursewareFile")}</label>
                    <Input
                      ref={cwFileInputRef}
                      type="file"
                      accept=".ppt,.pptx,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.mp3,.mp4"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCwFile(file);
                        if (file && !cwName.trim()) setCwName(file.name);
                      }}
                      className="cursor-pointer bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/15"
                    />
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      {t("courseDetail.coursewareUploadHint")}
                    </p>
                  </div>

                  {cwError && (
                    <p className="text-xs text-red-500 bg-red-500/5 p-2 rounded-lg border border-red-500/20">
                      {cwError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={cwAdding || !cwFile}
                    className="w-full bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-semibold shadow-sm active:scale-[0.98]"
                  >
                    {cwAdding ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-current" />
                        {t("courseDetail.uploadingToOss")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2"><Upload className="h-4 w-4" />{t("courseDetail.uploadCourseware")}</span>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Right Side: Courseware Library */}
            <Card className="border border-border/60 bg-card rounded-2xl shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-bold">{t("courseDetail.coursewareLibrary")}</CardTitle>
                <CardDescription className="text-xs">{t("courseDetail.coursewareLibraryCurrentDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                {courseware.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-border/60 rounded-xl bg-muted/10">
                    <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">{t("courseDetail.noCourseware")}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{t("courseDetail.addCoursewareHint")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {courseware.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/20 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          {getFileIcon(item.ext)}
                          <div>
                            <p className="text-sm font-bold text-foreground">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{t("courseDetail.formatLabel")}: {item.ext.toUpperCase()}</span>
                              <span>•</span>
                              <span>{t("courseDetail.sizeLabel")}: {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : t("common.unknown")}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 font-semibold text-xs">
                          <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">{t("courseDetail.uploaded")}</Badge>

                          <a
                            href={item.downloadUrl}
                            className="text-xs text-primary hover:underline font-semibold ml-2"
                          >
                            {t("courseDetail.downloadCourseware")}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-0">
          <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
            <CardHeader className="border-b border-border/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">
                    {t("courseDetail.classAttendance")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("courseDetail.classAttendanceDescription")}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-xl text-xs"
                    disabled={attendanceLoading}
                    onClick={() => void fetchAttendance()}
                  >
                    {attendanceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {t("courseDetail.refresh")}
                  </Button>
                  <Button
                    type="button"
                    className="h-9 rounded-xl bg-primary text-xs text-white hover:bg-primary/95"
                    onClick={exportAttendanceCsv}
                  >
                    <FileText className="h-4 w-4" />
                    {t("courseDetail.exportCsv")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {attendanceError && (
                <div
                  role="alert"
                  className="mb-4 flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-destructive sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p className="text-xs font-medium">{attendanceError}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg border-destructive/25 bg-background text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={attendanceLoading}
                    onClick={() => void fetchAttendance()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("courseDetail.tryAgain")}
                  </Button>
                </div>
              )}

              {attendance.length === 0 && !attendanceError ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-10 text-center">
                  <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {attendanceLoading
                      ? t("common.loading")
                      : t("courseDetail.noAttendance")}
                  </p>
                </div>
              ) : attendance.length > 0 ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[880px] divide-y divide-border/50 rounded-xl border border-border/60">
                    <div className="grid grid-cols-[1.5fr_0.7fr_1.2fr_1.2fr_0.9fr_0.7fr] gap-3 bg-muted/30 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <span>{t("courseDetail.attendanceStudent")}</span>
                      <span>{t("courseDetail.attendanceSessions")}</span>
                      <span>{t("courseDetail.attendanceFirstEntered")}</span>
                      <span>{t("courseDetail.attendanceLatestActivity")}</span>
                      <span>{t("courseDetail.attendanceTotalDuration")}</span>
                      <span>{t("courseDetail.attendanceStatus")}</span>
                    </div>
                    {attendance.map((record) => (
                      <div
                        key={record.studentId}
                        className="grid grid-cols-[1.5fr_0.7fr_1.2fr_1.2fr_0.9fr_0.7fr] items-center gap-3 px-4 py-3 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-7 w-7 border border-border/70">
                            <AvatarImage src={record.studentAvatar || ""} />
                            <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                              {(record.studentName || record.studentId || "S").slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {record.studentName || record.studentId}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {record.studentId}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-foreground">
                          {record.sessionCount}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(record.firstEnteredAt).toLocaleString(locale)}
                        </span>
                        <span className="text-muted-foreground">
                          {record.online
                            ? t("courseDetail.onlineNow")
                            : record.lastActivityAt
                            ? new Date(record.lastActivityAt).toLocaleString(locale)
                            : t("courseDetail.noActivity")}
                        </span>
                        <span className="font-mono font-semibold">
                          {formatAttendanceDuration(record.totalDurationSec)}
                        </span>
                        <span>
                          <Badge
                            variant="outline"
                            className={
                              record.online
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                : "border-border/60 bg-muted/20 text-muted-foreground"
                            }
                          >
                            {record.online
                              ? t("courseDetail.online")
                              : record.closedByCourseEnd
                                ? t("courseDetail.classEnded")
                                : t("courseDetail.left")}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="mt-0">
          <Card className="border border-border/60 bg-card rounded-2xl shadow-sm max-w-3xl">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t("courseDetail.tabs.requirementsStudent")}</CardTitle>
              <CardDescription className="text-xs">{t("courseDetail.studentRemarksDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {course.studentRemarks ? (
                <div className="relative p-6 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="absolute top-4 left-4 text-4xl text-primary/10 font-serif leading-none">&quot;</div>
                  <p className="relative z-10 text-base text-foreground/95 leading-relaxed indent-4 px-2 font-medium">
                    {course.studentRemarks}
                  </p>
                  <div className="absolute bottom-[-10px] right-4 text-4xl text-primary/10 font-serif leading-none rotate-180">&quot;</div>
                </div>
              ) : (
                <div className="p-12 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
                  <Info className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">{t("courseDetail.studentRemarksEmpty")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
