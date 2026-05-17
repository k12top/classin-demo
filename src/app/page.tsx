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
      <>
        <div className="page-bg" />
        <div className="dashboard-loading">
          <div className="loader" />
          <p>{authLoading ? "加载中…" : "正在跳转登录…"}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-bg" />
      <div className="dashboard-container">
        {/* Top Navigation */}
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <div className="nav-logo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <span className="nav-title">灵动课堂</span>
          </div>
          <div className="nav-user">
            <div className="nav-user-info">
              <span className="nav-user-name">{user.displayName || user.name}</span>
              <span className={`nav-role-badge ${user.role}`}>
                {user.role === "teacher" ? "👨‍🏫 老师" : "🧑‍🎓 学生"}
              </span>
            </div>
            <button className="nav-logout" onClick={logout} title="退出登录">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="dashboard-main">
          <div className="dashboard-header">
            <div>
              <h1 className="dashboard-title">
                {user.role === "teacher" ? "我的课程" : "我参加的课程"}
              </h1>
              <p className="dashboard-subtitle">
                {user.role === "teacher"
                  ? `共 ${courses.length} 门课程`
                  : `已加入 ${courses.length} 门课程`}
              </p>
            </div>
            {user.role === "teacher" && (
              <button
                className="btn btn-primary create-course-btn"
                onClick={() => router.push("/courses/create")}
                id="btn-create-course"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                创建课程
              </button>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="dashboard-loading-inline">
              <div className="loader" />
              <p>加载课程列表…</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && courses.length === 0 && (
            <div className="empty-state card">
              <div className="empty-icon">📭</div>
              <h3>{user.role === "teacher" ? "还没有创建课程" : "还没有加入课程"}</h3>
              <p>
                {user.role === "teacher"
                  ? "点击上方的「创建课程」按钮开始吧"
                  : "等待老师将您加入课程"}
              </p>
            </div>
          )}

          {/* Course Grid */}
          {!loading && courses.length > 0 && (
            <div className="course-grid">
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="course-card card"
                  onClick={() => router.push(`/courses/${course.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="course-card-header">
                    <span className="course-type-icon">
                      {ROOM_TYPE_ICONS[course.roomType] || "📹"}
                    </span>
                    <span className="course-type-label">
                      {ROOM_TYPE_LABELS[course.roomType] || "课堂"}
                    </span>
                  </div>
                  <h3 className="course-card-title">{course.name}</h3>
                  {course.description && (
                    <p className="course-card-desc">{course.description}</p>
                  )}
                  <div className="course-card-footer">
                    <span className="course-card-teacher">
                      👨‍🏫 {course.teacherName}
                    </span>
                    <span className="course-card-students">
                      👥 {course.students?.length || 0} 名学生
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
