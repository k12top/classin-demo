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
  groupLinks?: { group: { id: string; name: string } }[];
  activeJoinLinks?: { id: string; label: string; joinUrl: string; useCount: number }[];
  activeCourseShareLinks?: { id: string; label: string; courseShareUrl: string; useCount: number }[];
}

function LoadingView({ message }: { message: string }) {
  return <PageLoadingState message={message} variant="dashboard" />;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    try {
      let res = await fetch("/api/courses", { credentials: "same-origin" });
      if (res.status === 401 && (await tryOAuthRefresh())) {
        res = await fetch("/api/courses", { credentials: "same-origin" });
      }
      if (res.status === 401) {
        redirectToSsoLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses);
      }
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    } finally {
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
