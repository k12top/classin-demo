"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";

import TeacherCourseDetail from "@/components/TeacherCourseDetail";
import StudentCourseDetail from "@/components/StudentCourseDetail";

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
        setError("课程不存在或无权访问");
      }
    } catch {
      setError("加载失败");
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

  // Enter classroom logic
  const handleEnterClassroom = async () => {
    if (!course || !user) return;
    setEnterLoading(true);

    try {
      const res = await fetch(`/api/courses/${id}/verify-access`);
      if (!res.ok) {
        setError("验证访问权限失败，请稍后重试");
        setEnterLoading(false);
        return;
      }
      const data = await res.json();

      if (!data.allowed) {
        router.push(`/access-denied?reason=${encodeURIComponent(data.reason || "无权访问")}&course=${encodeURIComponent(course.name)}`);
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
      setError("验证访问权限失败");
      setEnterLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
        <p>加载课程详情…</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <>
        <div className="page-bg" />
        <div className="auth-container">
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <h2>⚠️ {error || "课程不存在"}</h2>
            <button className="btn btn-primary" style={{ marginTop: 20, maxWidth: 200 }} onClick={() => router.push("/")}>
              返回首页
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-bg" />
      <div className="dashboard-container">
        <nav className="dashboard-nav">
          <button className="btn-link" onClick={() => router.push("/")} style={{ color: "var(--color-text-secondary)" }}>
            ← 返回列表
          </button>
          <div className="nav-user">
            <span className={`nav-role-badge ${user?.role}`}>
              {user?.role === "teacher" ? "👨‍🏫 老师" : "🧑‍🎓 学生"}
            </span>
          </div>
        </nav>

        <main className="dashboard-main" style={{ maxWidth: '1000px', margin: '0 auto' }}>
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
    </>
  );
}
