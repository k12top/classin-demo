"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";

interface CourseDetail {
  id: string;
  name: string;
  description: string;
  roomType: number;
  teacherId: string;
  teacherName: string;
  status: string;
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

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一课堂",
  4: "小班课",
  2: "大班课",
};

interface GroupNode {
  id: string;
  name: string;
  members: { userId: string; userName?: string }[];
  children?: GroupNode[];
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

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enterLoading, setEnterLoading] = useState(false);
  const [error, setError] = useState("");

  // Search / add students
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; displayName: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

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

  const fetchMyGroups = useCallback(async () => {
    let res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.status === 401 && (await tryOAuthRefresh())) {
      res = await fetch("/api/groups", { credentials: "same-origin" });
    }
    if (res.status === 401) {
      redirectToSsoLogin();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  useEffect(() => {
    if (user && course && casdoorUserIdsMatch(course.teacherId, user.userId)) {
      queueMicrotask(() => {
        void fetchMyGroups();
      });
    }
  }, [user, course, fetchMyGroups]);

  const isTeacher =
    Boolean(user && course && casdoorUserIdsMatch(course.teacherId, user.userId));

  // Enter classroom
  const handleEnterClassroom = async () => {
    if (!course || !user) return;
    setEnterLoading(true);

    // Verify access first
    try {
      const res = await fetch(`/api/courses/${id}/verify-access`);
      if (!res.ok) {
        setError("验证访问权限失败，请稍后重试");
        return;
      }
      const data = await res.json();

      if (!data.allowed) {
        router.push(`/access-denied?reason=${encodeURIComponent(data.reason || "无权访问")}&course=${encodeURIComponent(course.name)}`);
        return;
      }

      // Build classroom URL
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
    } finally {
      setEnterLoading(false);
    }
  };

  // Search students
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
          setSearchError("未找到匹配用户，请尝试用户名或显示名（Casdoor 登录名）");
        }
      } else {
        setSearchResults([]);
        setSearchError(
          data.hint || data.error || `搜索失败 (${res.status})`
        );
      }
    } catch {
      setSearchResults([]);
      setSearchError("搜索请求失败，请检查网络后重试");
    } finally {
      setSearching(false);
    }
  };

  // Add student to course
  const handleAddStudent = async (studentId: string, studentName: string) => {
    try {
      const res = await fetch(`/api/courses/${id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: [{ studentId, studentName }] }),
      });
      if (res.ok) {
        fetchCourse(); // refresh
        setSearchResults((prev) => prev.filter((u) => u.id !== studentId));
      }
    } catch {
      // ignore
    }
  };

  // Remove student
  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm("确定移除该学生？")) return;
    try {
      await fetch(`/api/courses/${id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      fetchCourse();
    } catch {
      // ignore
    }
  };

  const linkedGroupIdSet = course
    ? new Set(course.groupLinks.map((l) => l.group.id))
    : new Set<string>();

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
          courseId: id,
        }),
      });
      if (res.ok) await fetchCourse();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleUnlinkGroupFromCourse = async (groupId: string) => {
    if (!confirm("确定取消该学生组与本课程的关联？")) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlinkFromCourse",
          groupId,
          courseId: id,
        }),
      });
      if (res.ok) await fetchCourse();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("确定删除该学生组？已关联本课程的组也会被解除关联。")) return;
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

  const handleAddUserToGroup = async (
    u: { id: string; name: string; displayName: string }
  ) => {
    if (!memberTargetGroupId) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addMembers",
          groupId: memberTargetGroupId,
          members: [{ userId: u.id, userName: u.displayName || u.name }],
        }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="page-bg" />
        <div className="dashboard-loading">
          <div className="loader" />
          <p>加载课程详情…</p>
        </div>
      </>
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
            ← 返回
          </button>
          <div className="nav-user">
            <span className={`nav-role-badge ${user?.role}`}>
              {user?.role === "teacher" ? "👨‍🏫 老师" : "🧑‍🎓 学生"}
            </span>
          </div>
        </nav>

        <main className="dashboard-main">
          {/* Course Header */}
          <div className="course-detail-header card animate-in animate-in-delay-1">
            <div className="course-detail-top">
              <div>
                <span className="course-type-label">{ROOM_TYPE_LABELS[course.roomType] || "课堂"}</span>
                <h1 className="course-detail-name">{course.name}</h1>
                {course.description && (
                  <p className="course-detail-desc">{course.description}</p>
                )}
              </div>
              <button
                className="btn btn-primary enter-classroom-btn"
                onClick={handleEnterClassroom}
                disabled={enterLoading}
                id="btn-enter-classroom"
              >
                {enterLoading ? (
                  <><span className="spinner" />进入中…</>
                ) : (
                  <>🎬 进入课堂</>
                )}
              </button>
            </div>
            <div className="room-meta" style={{ marginTop: 16 }}>
              <div className="room-meta-item">
                <span className="room-meta-label">授课老师</span>
                <span className="room-meta-value">{course.teacherName}</span>
              </div>
              <div className="room-meta-item">
                <span className="room-meta-label">学生人数</span>
                <span className="room-meta-value">{course.students.length}</span>
              </div>
              <div className="room-meta-item">
                <span className="room-meta-label">学生组</span>
                <span className="room-meta-value">{course.groupLinks.length} 个</span>
              </div>
            </div>
          </div>

          {/* Student Management (Teacher only) */}
          {isTeacher && (
            <div className="card animate-in animate-in-delay-2" style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
                👥 学生管理
              </h3>

              {/* Search & Add */}
              <div className="student-search-bar">
                <input
                  className="form-input"
                  placeholder="搜索用户名、姓名或邮箱…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  style={{ minWidth: 80 }}
                >
                  {searching ? "搜索中…" : "搜索"}
                </button>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <label style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  将搜索用户加入学生组
                </label>
                <select
                  className="form-input"
                  style={{ maxWidth: 280, margin: 0 }}
                  value={memberTargetGroupId}
                  onChange={(e) => setMemberTargetGroupId(e.target.value)}
                >
                  <option value="">选择学生组…</option>
                  {flattenGroups(myGroups).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {searchError && (
                <p
                  className="login-notice"
                  role="status"
                  style={{ marginTop: 12, fontSize: 13 }}
                >
                  {searchError}
                </p>
              )}

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((u) => {
                    const isAlready = course.students.some((s) =>
                      casdoorUserIdsMatch(s.studentId, u.id)
                    );
                    return (
                      <div key={u.id} className="search-result-item">
                        <div className="search-result-info">
                          <span className="search-result-name">{u.displayName || u.name}</span>
                          <span className="search-result-email">{u.email}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            type="button"
                            className={`btn ${isAlready ? "btn-disabled" : "btn-secondary"}`}
                            disabled={isAlready}
                            onClick={() => handleAddStudent(u.id, u.displayName || u.name)}
                            style={{ padding: "6px 14px", fontSize: 12, minWidth: "auto" }}
                          >
                            {isAlready ? "已加课程" : "加入课程"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={!memberTargetGroupId || groupBusy}
                            onClick={() => handleAddUserToGroup(u)}
                            style={{ padding: "6px 14px", fontSize: 12, minWidth: "auto" }}
                          >
                            入组
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Current Students */}
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                  已分配学生 ({course.students.length})
                </h4>
                {course.students.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>暂无学生，使用上方搜索添加</p>
                ) : (
                  <div className="student-list">
                    {course.students.map((s) => (
                      <div key={s.id} className="student-item">
                        <span className="student-item-name">{s.studentName || s.studentId}</span>
                        <button
                          className="student-remove-btn"
                          onClick={() => handleRemoveStudent(s.studentId)}
                          title="移除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {isTeacher && (
            <div className="card animate-in animate-in-delay-3" style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
                📋 学生组
              </h3>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
                创建组、用上方搜索将用户加入组，并把组关联到本课程后，组成员即可进入课堂。
              </p>
              <div className="student-search-bar" style={{ marginBottom: 20 }}>
                <input
                  className="form-input"
                  placeholder="新建组名称…"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={groupBusy || !newGroupName.trim()}
                  onClick={handleCreateGroup}
                >
                  创建
                </button>
              </div>
              <h4 style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                我的学生组
              </h4>
              {myGroups.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>暂无组，请先创建。</p>
              ) : (
                <div className="student-list" style={{ marginBottom: 20 }}>
                  {myGroups.map((g) => (
                    <div key={g.id} className="student-item" style={{ justifyContent: "space-between", gap: 12 }}>
                      <span>
                        <span className="student-item-name">{g.name}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>
                          {countNestedMembers(g)} 人
                          {linkedGroupIdSet.has(g.id) ? " · 已关联本课程" : ""}
                        </span>
                      </span>
                      <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {!linkedGroupIdSet.has(g.id) && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "4px 12px", fontSize: 12 }}
                            disabled={groupBusy}
                            onClick={() => handleLinkGroupToCourse(g.id)}
                          >
                            关联本课程
                          </button>
                        )}
                        <button
                          type="button"
                          className="student-remove-btn"
                          title="删除组"
                          disabled={groupBusy}
                          onClick={() => handleDeleteGroup(g.id)}
                        >
                          🗑
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <h4 style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                已关联到本课程
              </h4>
              {course.groupLinks.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>尚未关联任何学生组。</p>
              ) : (
                <div className="student-list">
                  {course.groupLinks.map((link) => (
                    <div
                      key={link.id}
                      className="student-item"
                      style={{ justifyContent: "space-between", gap: 12 }}
                    >
                      <span>
                        <span className="student-item-name">{link.group.name}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>
                          {link.group.members.length} 名成员
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "4px 12px", fontSize: 12, flexShrink: 0 }}
                        disabled={groupBusy}
                        onClick={() => handleUnlinkGroupFromCourse(link.group.id)}
                      >
                        取消关联
                      </button>
                    </div>
                  ))}
                </div>
               )}
            </div>
          )}

          {!isTeacher && course.groupLinks.length > 0 && (
            <div className="card animate-in animate-in-delay-3" style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
                📋 已关联学生组
              </h3>
              {course.groupLinks.map((link) => (
                <div key={link.id} className="group-link-card">
                  <span className="group-link-name">{link.group.name}</span>
                  <span className="group-link-count">{link.group.members.length} 名成员</span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
