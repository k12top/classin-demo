"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import StudentDashboard from "@/components/StudentDashboard";
import TeacherDashboard from "@/components/TeacherDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
  activeJoinLinks?: { id: string; label: string; joinUrl: string; useCount: number }[];
}

function LoadingView({ message }: { message: string }) {
  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <Card className="glass-panel w-full max-w-sm border-white/10 bg-white/5 animate-in fade-in zoom-in duration-300">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

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
    return <LoadingView message={authLoading ? "加载中…" : "正在跳转登录…"} />;
  }

  if (loading) {
    return <LoadingView message="加载课程列表…" />;
  }

  if (user.role === "teacher") {
    return <TeacherDashboard courses={courses} user={user} fetchCourses={fetchCourses} />;
  }

  return <StudentDashboard courses={courses} user={user} fetchCourses={fetchCourses} />;
}
