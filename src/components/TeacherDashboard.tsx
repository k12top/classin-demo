"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";

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
}

interface GroupNode {
  id: string;
  name: string;
  members: { userId: string; userName?: string }[];
  children?: GroupNode[];
}

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一",
  4: "小班",
  2: "大班",
};

type SidebarPage = "schedule" | "students" | "settings";

export default function TeacherDashboard({ courses, user, fetchCourses }: { courses: Course[], user: any, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("schedule");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Student management state
  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; displayName: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");

  const fetchMyGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  useEffect(() => {
    if (activePage === "students") {
      fetchMyGroups();
    }
  }, [activePage, fetchMyGroups]);

  const handleStatusChange = async (courseId: string, status: string) => {
    if (!confirm(`确定将课程标记为 ${status === 'finished' ? '已结束' : '已取消'} 吗？`)) return;
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
    return courses.filter(c => {
      if (!c.startTime) return false;
      return isSameDay(new Date(c.startTime), selectedDate);
    });
  }, [courses, selectedDate]);

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

  /* ── Student management handlers ── */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSearchResults(data.users ?? []);
        if (!data.users?.length) setSearchError("未找到匹配用户");
      } else {
        setSearchResults([]);
        setSearchError(data.hint || data.error || "搜索失败");
      }
    } catch {
      setSearchResults([]);
      setSearchError("搜索失败，请检查网络");
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
    if (!confirm("确定删除该学生组？")) return;
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

  const handleAddUserToGroup = async (u: { id: string; name: string; displayName: string }) => {
    if (!memberTargetGroupId) {
      alert("请先选择要加入的学生组");
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
          members: [{ userId: u.id, userName: u.displayName || u.name }],
        }),
      });
      if (res.ok) await fetchMyGroups();
    } finally {
      setGroupBusy(false);
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!confirm("确定移除该成员？")) return;
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

  return (
    <div className="teacher-dashboard">
      <aside className="sidebar">
        <div className="user-profile">
          <div className="avatar">{user.displayName?.[0] || 'T'}</div>
          <span className="username">{user.displayName || user.name} <span className="role-badge teacher">Teacher</span></span>
        </div>
        <nav className="side-menu">
          <button className={`menu-item ${activePage === 'schedule' ? 'active' : ''}`} onClick={() => setActivePage('schedule')}>
            <span className="icon">📅</span> 我的课表
          </button>
          <button className={`menu-item ${activePage === 'students' ? 'active' : ''}`} onClick={() => setActivePage('students')}>
            <span className="icon">👥</span> 学生管理
          </button>
          <button className={`menu-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => setActivePage('settings')}>
            <span className="icon">⚙️</span> 个人设置
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {/* ──── Schedule Page ──── */}
        {activePage === "schedule" && (
          <>
            <div className="teacher-header">
              <h2>我的课表</h2>
              <button className="btn-primary" onClick={() => router.push("/courses/create")}>+ 创建课程</button>
            </div>

            <div className="schedule-container">
              <div className="calendar-panel">
                <div className="calendar-header">
                  <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}>&lt;</button>
                  <span>{selectedDate.getFullYear()}年 {selectedDate.getMonth() + 1}月</span>
                  <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}>&gt;</button>
                </div>
                <div className="calendar-grid">
                  {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="cal-day-header">{d}</div>)}
                  {generateCalendarDays().map((date, idx) => (
                    <div 
                      key={idx} 
                      className={`cal-day ${date ? '' : 'empty'} ${date && isSameDay(date, selectedDate) ? 'selected' : ''} ${date && isSameDay(date, new Date()) ? 'today' : ''}`}
                      onClick={() => date && setSelectedDate(date)}
                    >
                      {date ? date.getDate() : ''}
                      {date && courses.some(c => c.startTime && isSameDay(new Date(c.startTime), date)) && (
                        <div className="cal-dot"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="daily-schedule">
                <h3>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 课程安排</h3>
                {selectedCourses.length === 0 ? (
                  <div className="empty-state">今天没有课程安排哦</div>
                ) : (
                  <div className="course-list-compact">
                    {selectedCourses.map(course => (
                      <div key={course.id} className="course-card">
                        <div className="course-details">
                          <h3>{course.name} <span className={`status-badge ${course.status}`}>{course.status === 'active' ? '待上课' : course.status === 'finished' ? '已结束' : '已取消'}</span></h3>
                          <div className="course-time">
                            {course.startTime ? new Date(course.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''} 
                            - 
                            {course.endTime ? new Date(course.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                          </div>
                          <div className="course-meta">
                             <span className="course-tag">{ROOM_TYPE_LABELS[course.roomType] || "课堂"}</span>
                          </div>
                          {course.studentRemarks && (
                            <div className="remarks-section student-remarks-read">
                              <strong>学生要求:</strong> {course.studentRemarks}
                            </div>
                          )}
                          
                          <div className="actions">
                            <button className="btn-primary" onClick={() => router.push(`/courses/${course.id}`)}>进入教室</button>
                            {course.status === 'active' && (
                              <>
                                <button className="btn-secondary" onClick={() => handleStatusChange(course.id, "finished")}>结束课程</button>
                                <button className="btn-danger" onClick={() => handleStatusChange(course.id, "cancelled")}>取消课程</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ──── Student Management Page ──── */}
        {activePage === "students" && (
          <div className="student-mgmt-page">
            <div className="teacher-header">
              <h2>学生管理</h2>
            </div>

            <div className="mgmt-section">
              <div className="mgmt-split">
                {/* Left: Search & Add */}
                <div className="mgmt-column">
                  <h3 className="mgmt-section-title">搜索用户</h3>
                  <div className="search-bar-inline">
                    <input
                      className="form-input"
                      placeholder="输入用户名、显示名或邮箱…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <button className="btn btn-primary" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                      {searching ? "搜索中…" : "搜索"}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mgmt-add-to-group">
                      <label>加入学生组：</label>
                      <select
                        className="form-input"
                        value={memberTargetGroupId}
                        onChange={(e) => setMemberTargetGroupId(e.target.value)}
                      >
                        <option value="">选择学生组…</option>
                        {flattenGroups(myGroups).map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {searchError && <p className="error-text">{searchError}</p>}

                  {searchResults.length > 0 && (
                    <div className="search-results-list">
                      {searchResults.map((u) => (
                        <div key={u.id} className="search-result-row">
                          <div className="user-info">
                            <span className="user-name">{u.displayName || u.name}</span>
                            <span className="user-email">{u.email}</span>
                          </div>
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={groupBusy || !memberTargetGroupId}
                            onClick={() => handleAddUserToGroup(u)}
                          >
                            加入组
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Groups */}
                <div className="mgmt-column">
                  <h3 className="mgmt-section-title">学生组</h3>
                  <div className="search-bar-inline">
                    <input
                      className="form-input"
                      placeholder="新建学生组名称…"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                    />
                    <button className="btn btn-secondary" disabled={groupBusy || !newGroupName.trim()} onClick={handleCreateGroup}>
                      创建
                    </button>
                  </div>

                  {myGroups.length === 0 ? (
                    <p className="empty-hint">暂无学生组，请先创建。</p>
                  ) : (
                    <div className="group-mgmt-list">
                      {myGroups.map((g) => (
                        <div key={g.id} className="group-mgmt-card">
                          <div className="group-mgmt-header">
                            <div>
                              <strong>{g.name}</strong>
                              <span className="group-meta">{countMembers(g)} 人</span>
                            </div>
                            <button className="icon-btn-danger" disabled={groupBusy} onClick={() => handleDeleteGroup(g.id)} title="删除组">🗑</button>
                          </div>
                          {(g.members?.length ?? 0) > 0 ? (
                            <div className="group-members-list">
                              {g.members.map((m) => (
                                <div key={m.userId} className="group-member-row">
                                  <span>{m.userName || m.userId}</span>
                                  <button className="icon-btn-danger" onClick={() => handleRemoveMember(g.id, m.userId)} title="移除">✕</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="empty-hint" style={{padding: '8px 0', fontSize: 12}}>暂无成员</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──── Settings Page ──── */}
        {activePage === "settings" && (
          <SettingsPanel user={user} onLogout={logout} />
        )}
      </main>
    </div>
  );
}

/* ─── Settings Panel ─── */
function SettingsPanel({ user, onLogout }: { user: any; onLogout: () => void }) {
  return (
    <div className="settings-page">
      <h2 className="settings-title">个人设置</h2>

      <div className="settings-card">
        <h3>基本信息</h3>
        <div className="settings-grid">
          <div className="settings-field">
            <label>用户名</label>
            <div className="field-value">{user.name || "—"}</div>
          </div>
          <div className="settings-field">
            <label>显示名称</label>
            <div className="field-value">{user.displayName || "—"}</div>
          </div>
          <div className="settings-field">
            <label>邮箱</label>
            <div className="field-value">{user.email || "—"}</div>
          </div>
          <div className="settings-field">
            <label>角色</label>
            <div className="field-value">
              <span className="settings-role-badge teacher">👨‍🏫 教师</span>
            </div>
          </div>
          <div className="settings-field">
            <label>用户 ID</label>
            <div className="field-value field-value-mono">{user.userId}</div>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3>头像</h3>
        <div className="avatar-section">
          <div className="settings-avatar">
            {user.avatar ? (
              <img src={user.avatar} alt="avatar" />
            ) : (
              <span>{user.displayName?.[0] || user.name?.[0] || "U"}</span>
            )}
          </div>
          <p className="avatar-hint">头像信息来自 SSO 系统，如需更改请联系管理员。</p>
        </div>
      </div>

      <div className="settings-card settings-card-danger">
        <h3>账户操作</h3>
        <p className="danger-hint">退出当前账号后需要重新登录。</p>
        <button className="btn btn-danger" onClick={onLogout}>退出登录</button>
      </div>
    </div>
  );
}
