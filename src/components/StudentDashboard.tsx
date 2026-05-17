"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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
}

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一",
  4: "小班",
  2: "大班",
};

type SidebarPage = "learning" | "settings";

export default function StudentDashboard({ courses, user, fetchCourses }: { courses: Course[], user: any, fetchCourses: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [activePage, setActivePage] = useState<SidebarPage>("learning");
  const [activeTab, setActiveTab] = useState<"upcoming" | "finished" | "cancelled">("upcoming");
  const [editingRemarks, setEditingRemarks] = useState<string | null>(null);
  const [remarksValue, setRemarksValue] = useState("");

  const filteredCourses = useMemo(() => {
    switch (activeTab) {
      case "upcoming": return courses.filter(c => c.status === "active");
      case "finished": return courses.filter(c => c.status === "finished");
      case "cancelled": return courses.filter(c => c.status === "cancelled");
      default: return [];
    }
  }, [courses, activeTab]);

  const handleStatusChange = async (courseId: string, status: string) => {
    if (!confirm(`确定要${status === 'cancelled' ? '请假（取消该课程）' : '变更状态'}吗？`)) return;
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

  const handleSaveRemarks = async (courseId: string) => {
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRemarks: remarksValue })
      });
      if (res.ok) {
        setEditingRemarks(null);
        fetchCourses();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "时间未定";
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="student-dashboard">
      <aside className="sidebar">
        <div className="user-profile">
          <div className="avatar">{user.displayName?.[0] || 'S'}</div>
          <span className="username">{user.displayName || user.name} <span className="vip-badge">VIP</span></span>
        </div>
        <nav className="side-menu">
          <button className={`menu-item ${activePage === 'learning' ? 'active' : ''}`} onClick={() => setActivePage('learning')}>
            <span className="icon">📖</span> 学习中心
          </button>
          <button className={`menu-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => setActivePage('settings')}>
            <span className="icon">⚙️</span> 个人设置
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {activePage === "learning" && (
          <>
            <div className="banner">
              <div className="banner-content">
                <h2>1对1中文精读+表达</h2>
                <p>请联系顾问预约试听课</p>
              </div>
            </div>

            <div className="tabs">
              <button className={`tab ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>待上课</button>
              <button className={`tab ${activeTab === 'finished' ? 'active' : ''}`} onClick={() => setActiveTab('finished')}>已结束 (复习和回放)</button>
              <button className={`tab ${activeTab === 'cancelled' ? 'active' : ''}`} onClick={() => setActiveTab('cancelled')}>已取消</button>
            </div>

            <div className="course-list">
              {filteredCourses.length === 0 ? (
                <div className="empty-state">没有相关课程</div>
              ) : (
                <div className="timeline-view">
                  {filteredCourses.map(course => (
                    <div key={course.id} className="timeline-item">
                      <div className="timeline-date">{formatTime(course.startTime)}</div>
                      <div className="course-card">
                        <div className="course-cover">
                          <div className="course-cover-img" />
                          {activeTab === 'upcoming' && (
                            <button className="action-btn-text" onClick={() => handleStatusChange(course.id, "cancelled")}>我 要 请 假</button>
                          )}
                        </div>
                        <div className="course-details">
                          <h3>{course.name}</h3>
                          <div className="course-meta">
                             <span className="course-tag">{ROOM_TYPE_LABELS[course.roomType] || "课堂"}</span>
                          </div>
                          <p className="teacher-info">老师：{course.teacherName}</p>
                          <div className="remarks-section">
                            <span>要求：</span>
                            {editingRemarks === course.id ? (
                              <div className="edit-remarks">
                                <input 
                                  type="text" 
                                  value={remarksValue} 
                                  onChange={(e) => setRemarksValue(e.target.value)} 
                                  placeholder="填写要求..."
                                />
                                <button onClick={() => handleSaveRemarks(course.id)}>保存</button>
                                <button onClick={() => setEditingRemarks(null)}>取消</button>
                              </div>
                            ) : (
                              <span className="remarks-text">
                                {course.studentRemarks || "暂无备注"}
                                <button className="edit-icon" onClick={() => { setEditingRemarks(course.id); setRemarksValue(course.studentRemarks); }}>✏️</button>
                              </span>
                            )}
                          </div>
                          <div className="actions">
                            <button className="btn-primary" onClick={() => router.push(`/courses/${course.id}`)}>进入教室</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

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
              <span className="settings-role-badge student">🧑‍🎓 学生</span>
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
