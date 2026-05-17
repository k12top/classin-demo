"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";

interface Course {
  id: string;
  name: string;
  description: string;
  roomType: number;
  teacherId: string;
  teacherName: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  studentRemarks: string;
  createdAt: string;
  updatedAt: string;
  students?: { studentId: string; studentName: string }[];
  groupLinks?: { group: { id: string; name: string } }[];
}

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一课堂",
  4: "小班课",
  2: "大班课",
};

const ROOM_TYPE_ICONS: Record<number, string> = {
  0: "👤",
  4: "👥",
  2: "🏫",
};

import StudentDashboard from "@/components/StudentDashboard";
import TeacherDashboard from "@/components/TeacherDashboard";

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
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

  if (authLoading || !user) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
        <p>{authLoading ? "加载中…" : "正在跳转登录…"}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
        <p>加载课程列表…</p>
      </div>
    );
  }

  if (user.role === "teacher") {
    return <TeacherDashboard courses={courses} user={user} fetchCourses={fetchCourses} />;
  }

  return <StudentDashboard courses={courses} user={user} fetchCourses={fetchCourses} />;
}
