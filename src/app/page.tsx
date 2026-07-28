"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { useTranslation } from "@/lib/i18n/context";
import StudentDashboard from "@/components/StudentDashboard";
import TeacherDashboard from "@/components/TeacherDashboard";
import { PageLoadingState } from "@/components/ui/page-loading-state";

interface Course {
  id: string;
  name: string;
  description: string;
  roomType: number;
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  teachers?: { id?: string; teacherId: string; teacherName: string; teacherAvatar?: string }[];
  isCourseOwner?: boolean;
  canTeach?: boolean;
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
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

let dashboardCourseCache: Course[] | null = null;
let dashboardCourseRequest: Promise<Course[]> | null = null;

function LoadingView({ message }: { message: string }) {
  return <PageLoadingState message={message} variant="dashboard" />;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<Course[]>(
    () => dashboardCourseCache ?? [],
  );
  const [loading, setLoading] = useState(() => !dashboardCourseCache);

  const fetchCourses = useCallback(async () => {
    try {
      dashboardCourseRequest ??= (async () => {
        let res = await fetch("/api/courses", {
          credentials: "same-origin",
        });
        if (res.status === 401 && (await tryOAuthRefresh())) {
          res = await fetch("/api/courses", { credentials: "same-origin" });
        }
        if (res.status === 401) {
          redirectToSsoLogin();
          return [];
        }
        if (!res.ok) throw new Error(`Course request failed: ${res.status}`);
        const data = (await res.json()) as { courses?: Course[] };
        return data.courses ?? [];
      })();
      const nextCourses = await dashboardCourseRequest;
      dashboardCourseCache = nextCourses;
      setCourses(nextCourses);
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    } finally {
      dashboardCourseRequest = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      queueMicrotask(() => {
        void fetchCourses();
      });
    }
  }, [authLoading, user, fetchCourses]);

  useEffect(() => {
    if (!authLoading && !user) {
      redirectToSsoLogin();
    }
  }, [authLoading, user]);

  const { t } = useTranslation();

  if (authLoading || !user) {
    return <LoadingView message={authLoading ? t("common.loading") : t("login.redirecting")} />;
  }

  if (loading) {
    return <LoadingView message={t("teacherDashboard.searching")} />;
  }

  if (user.role === "teacher") {
    return <TeacherDashboard courses={courses} user={user} fetchCourses={fetchCourses} />;
  }

  return <StudentDashboard courses={courses} user={user} fetchCourses={fetchCourses} />;
}
