"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, AlertTriangle } from "lucide-react";

import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import TeacherCourseDetail from "@/components/TeacherCourseDetail";
import StudentCourseDetail from "@/components/StudentCourseDetail";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/context";

interface CourseDetail {
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
  students: { id: string; studentId: string; studentName: string }[];
  groupLinks: {
    id: string;
    group: {
      id: string;
      name: string;
      members: { id: string; userId: string; userName: string }[];
    };
  }[];
}

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enterLoading, setEnterLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchCourse = useCallback(async () => {
    try {
      let res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      if (res.status === 401 && (await tryOAuthRefresh())) {
        res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      }
      if (res.status === 401) {
        redirectToSsoLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCourse(data.course);
      } else {
        setError("not_found");
      }
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchCourse();
    });
  }, [fetchCourse]);

  const isTeacher = Boolean(user && course && casdoorUserIdsMatch(course.teacherId, user.userId));

  const handleEnterClassroom = async () => {
    if (!course || !user) return;
    setEnterLoading(true);

    try {
      const res = await fetch(`/api/courses/${id}/verify-access`);
      if (!res.ok) {
        setError("verify_failed");
        setEnterLoading(false);
        return;
      }
      const data = await res.json();

      if (!data.allowed) {
        router.push(
          buildAccessDeniedUrl({
            code: data.code,
            reason: data.reason || "no_access",
            course: course.name,
            courseId: id,
          })
        );
        setEnterLoading(false);
        return;
      }

      const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
      const params = new URLSearchParams({
        roomUuid,
        roomType: String(course.roomType),
        roomName: course.name,
        courseId: course.id,
      });
      router.push(`/classroom?${params.toString()}`);
    } catch {
      setError("verify_failed");
      setEnterLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500/20 border-t-purple-500" />
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold">
            {error === "not_found"
              ? `${t("join.courseNotExist")} / ${t("classroom.noAccess")}`
              : error === "load_failed"
              ? t("common.failed")
              : error === "verify_failed"
              ? t("classroom.verifyFailed")
              : error || t("join.courseNotExist")}
          </h2>
          <p className="text-muted-foreground">
            {error === "not_found" ? t("join.notFound") : ""}
          </p>
          <Button onClick={() => router.push("/")} className="bg-purple-600 hover:bg-purple-700 text-white">
            {t("common.backToHome")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Nav Bar */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" /> {t("common.backToList")}
          </Button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Badge variant="secondary" className={
              isTeacher
                ? "bg-purple-500/20 text-purple-300 border-purple-500/20"
                : "bg-blue-500/20 text-blue-300 border-blue-500/20"
            }>
              {isTeacher ? `👨‍🏫 ${t("common.roleTeacher")}` : `🧑‍🎓 ${t("common.roleStudent")}`}
            </Badge>
            <span className="text-sm text-muted-foreground">{user?.displayName || user?.name}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {isTeacher ? (
          <TeacherCourseDetail 
            course={course} 
            user={user} 
            onEnterClassroom={handleEnterClassroom} 
            enterLoading={enterLoading}
            fetchCourse={fetchCourse}
          />
        ) : (
          <StudentCourseDetail 
            course={course} 
            user={user} 
            onEnterClassroom={handleEnterClassroom} 
            enterLoading={enterLoading}
            fetchCourse={fetchCourse}
          />
        )}
      </main>
    </div>
  );
}
