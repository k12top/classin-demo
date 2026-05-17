"use client";

import { useState, useEffect, useCallback } from "react";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";

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

export default function TeacherCourseDetail({ 
  course, 
  user,
  onEnterClassroom,
  enterLoading,
  fetchCourse
}: { 
  course: any; 
  user: any; 
  onEnterClassroom: () => void;
  enterLoading: boolean;
  fetchCourse: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"members" | "sharing" | "requirements">("members");

  // Search / add students
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; displayName: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Groups
  const [myGroups, setMyGroups] = useState<GroupNode[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [memberTargetGroupId, setMemberTargetGroupId] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  // Links
  const [joinLinks, setJoinLinks] = useState<any[]>([]);
  const [joinLinkBusy, setJoinLinkBusy] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [copyHint, setCopyHint] = useState("");

  const fetchMyGroups = useCallback(async () => {
    let res = await fetch("/api/groups", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMyGroups(data.groups ?? []);
    }
  }, []);

  const fetchJoinLinks = useCallback(async () => {
    const res = await fetch(`/api/courses/${course.id}/join-links`, {
      credentials: "same-origin",
    });
    if (res.ok) {
      const data = await res.json();
      setJoinLinks(data.links ?? []);
    }
  }, [course.id]);

  useEffect(() => {
    if (casdoorUserIdsMatch(course.teacherId, user.userId)) {
      fetchMyGroups();
      fetchJoinLinks();
    }
  }, [course.teacherId, user.userId, fetchMyGroups, fetchJoinLinks]);

  const copyText = async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(hint);
      setTimeout(() => setCopyHint(""), 2000);
    } catch {
      setCopyHint("复制失败，请手动选择复制");
    }
  };

  const handleCreateJoinLink = async () => {
    setJoinLinkBusy(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/join-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ label: newLinkLabel.trim() || undefined }),
      });
      if (res.ok) {
        setNewLinkLabel("");
        await fetchJoinLinks();
        const data = await res.json();
        if (data.link?.joinUrl) {
          await copyText(data.link.joinUrl, "已创建并复制分享链接");
        }
      }
    } finally {
      setJoinLinkBusy(false);
    }
  };

  const handleRevokeJoinLink = async (linkId: string) => {
    if (!confirm("确定撤销该分享链接？撤销后无法再通过此链接进入。")) return;
    setJoinLinkBusy(true);
    try {
      await fetch(`/api/courses/${course.id}/join-links/${linkId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await fetchJoinLinks();
    } finally {
      setJoinLinkBusy(false);
    }
  };

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
          setSearchError("未找到匹配用户，请尝试用户名或显示名");
        }
      } else {
        setSearchResults([]);
        setSearchError(data.hint || data.error || `搜索失败 (${res.status})`);
      }
    } catch {
      setSearchResults([]);
      setSearchError("搜索请求失败，请检查网络后重试");
    } finally {
      setSearching(false);
    }
  };

  const handleAddStudent = async (studentId: string, studentName: string) => {
    try {
      const res = await fetch(`/api/courses/${course.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: [{ studentId, studentName }] }),
      });
      if (res.ok) {
        fetchCourse();
        setSearchResults((prev) => prev.filter((u) => u.id !== studentId));
      }
    } catch { }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm("确定移除该学生？")) return;
    try {
      await fetch(`/api/courses/${course.id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      fetchCourse();
    } catch { }
  };

  const linkedGroupIdSet = course ? new Set(course.groupLinks.map((l: any) => l.group.id)) : new Set<string>();

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
          courseId: course.id,
        }),
      });
      if (res.ok) await fetchCourse();
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
      if (res.ok) {
        await fetchMyGroups();
        await fetchCourse();
      }
    } finally {
      setGroupBusy(false);
    }
  };

  const handleAddUserToGroup = async (u: { id: string; name: string; displayName: string }) => {
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

  const handleStatusChange = async (status: string) => {
    if (!confirm(`确定将课程标记为 ${status === 'finished' ? '已结束' : '已取消'} 吗？`)) return;
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCourse();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "未定";
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="course-detail-container">
      {/* Header Card */}
      <div className="course-header-card card animate-in">
        <div className="course-header-top">
          <div className="course-header-titles">
            <span className="course-tag">{ROOM_TYPE_LABELS[course.roomType] || "课堂"}</span>
            <h1 className="course-title">{course.name}</h1>
          </div>
          <div className="course-header-actions">
            {course.status === "active" && (
              <>
                <button className="btn btn-secondary" onClick={() => handleStatusChange("finished")}>结束课程</button>
                <button className="btn btn-danger" onClick={() => handleStatusChange("cancelled")}>取消课程</button>
              </>
            )}
            <button
              className="btn btn-primary"
              onClick={onEnterClassroom}
              disabled={enterLoading || course.status === "finished" || course.status === "cancelled"}
            >
              {enterLoading ? "进入中…" : "进入课堂"}
            </button>
          </div>
        </div>

        <div className="course-meta-row">
          <div className="meta-item">
            <span className="meta-icon">👥</span>
            <span>学生人数：<strong>{course.students.length}</strong></span>
          </div>
          <div className="meta-item">
            <span className="meta-icon">🕒</span>
            <span>上课时间：<strong>{formatTime(course.startTime)}</strong></span>
          </div>
          <div className="meta-item">
            <span className="meta-icon">🏷️</span>
            <span>状态：
              <span className={`status-badge ${course.status}`}>
                {course.status === 'active' ? '待上课' : course.status === 'finished' ? '已结束' : '已取消'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs Area */}
      <div className="course-tabs-section animate-in animate-in-delay-1">
        <div className="detail-tabs">
          <button 
            className={`detail-tab ${activeTab === "members" ? "active" : ""}`} 
            onClick={() => setActiveTab("members")}
          >
            👥 成员管理
          </button>
          <button 
            className={`detail-tab ${activeTab === "sharing" ? "active" : ""}`} 
            onClick={() => setActiveTab("sharing")}
          >
            🔗 课程分享
          </button>
          <button 
            className={`detail-tab ${activeTab === "requirements" ? "active" : ""}`} 
            onClick={() => setActiveTab("requirements")}
          >
            📝 学生要求
          </button>
        </div>

        <div className="detail-tab-content card">
          {activeTab === "members" && (
            <div className="tab-pane-members">
              <div className="split-layout">
                {/* Left Side: Direct Students */}
                <div className="split-column">
                  <h3>直接添加学生</h3>
                  <div className="search-bar-inline">
                    <input
                      className="form-input"
                      placeholder="搜索用户名、姓名或邮箱…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <button className="btn btn-primary" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                      {searching ? "搜索中…" : "搜索"}
                    </button>
                  </div>
                  {searchError && <p className="error-text">{searchError}</p>}
                  
                  {searchResults.length > 0 && (
                    <div className="search-results-list">
                      {searchResults.map((u) => {
                        const isAlready = course.students.some((s: any) => casdoorUserIdsMatch(s.studentId, u.id));
                        return (
                          <div key={u.id} className="search-result-row">
                            <div className="user-info">
                              <span className="user-name">{u.displayName || u.name}</span>
                              <span className="user-email">{u.email}</span>
                            </div>
                            <button
                              className={`btn ${isAlready ? "btn-disabled" : "btn-secondary"} btn-sm`}
                              disabled={isAlready}
                              onClick={() => handleAddStudent(u.id, u.displayName || u.name)}
                            >
                              {isAlready ? "已加入" : "添加"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <h4 className="sub-heading mt-24">已分配学生 ({course.students.length})</h4>
                  {course.students.length === 0 ? (
                    <p className="empty-hint">暂无直接分配的学生</p>
                  ) : (
                    <div className="enrolled-list">
                      {course.students.map((s: any) => (
                        <div key={s.id} className="enrolled-item">
                          <span>{s.studentName || s.studentId}</span>
                          <button className="icon-btn-danger" onClick={() => handleRemoveStudent(s.studentId)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Side: Groups */}
                <div className="split-column">
                  <h3>学生组管理</h3>
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

                  <h4 className="sub-heading mt-24">我的学生组</h4>
                  {myGroups.length === 0 ? (
                    <p className="empty-hint">暂无组，请先创建。</p>
                  ) : (
                    <div className="group-list">
                      {myGroups.map((g) => (
                        <div key={g.id} className="group-item">
                          <div className="group-info">
                            <strong>{g.name}</strong>
                            <span className="group-meta">{countNestedMembers(g)} 人</span>
                          </div>
                          <div className="group-actions">
                            {!linkedGroupIdSet.has(g.id) && (
                              <button className="btn btn-secondary btn-sm" disabled={groupBusy} onClick={() => handleLinkGroupToCourse(g.id)}>
                                关联课程
                              </button>
                            )}
                            <button className="icon-btn-danger" disabled={groupBusy} onClick={() => handleDeleteGroup(g.id)}>
                              🗑
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <h4 className="sub-heading mt-24">已关联的学生组</h4>
                  {course.groupLinks.length === 0 ? (
                    <p className="empty-hint">尚未关联任何学生组</p>
                  ) : (
                    <div className="group-list">
                      {course.groupLinks.map((link: any) => (
                        <div key={link.id} className="group-item linked">
                          <span>{link.group.name} ({countNestedMembers(link.group)} 人)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "sharing" && (
            <div className="tab-pane-sharing">
              <h3>生成 SSO 分享链接</h3>
              <p className="hint-text">生成免密进入直播的链接。可用于家长监控或未注册用户的临时访问。</p>
              
              <div className="search-bar-inline mt-16">
                <input
                  className="form-input"
                  placeholder="链接用途备注（例如：给张三妈妈的链接）"
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateJoinLink()}
                />
                <button className="btn btn-primary" disabled={joinLinkBusy} onClick={handleCreateJoinLink}>
                  {joinLinkBusy ? "处理中…" : "生成链接"}
                </button>
              </div>
              
              {copyHint && <p className="success-text mt-8">{copyHint}</p>}

              <h4 className="sub-heading mt-24">有效链接</h4>
              {joinLinks.length === 0 ? (
                <p className="empty-hint">暂无分享链接</p>
              ) : (
                <div className="join-link-grid">
                  {joinLinks.map((link) => (
                    <div key={link.id} className="join-link-card">
                      <div className="link-card-header">
                        <strong>{link.label || '无备注'}</strong>
                        <span className={`status-dot ${link.status}`}></span>
                      </div>
                      <div className="link-card-meta">
                        使用 {link.useCount} 次
                        {link.expiresAt ? ` · 到期 ${new Date(link.expiresAt).toLocaleDateString()}` : ""}
                      </div>
                      {link.status === "active" && link.joinUrl && (
                        <div className="link-card-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => void copyText(link.joinUrl!, "已复制链接")}>复制</button>
                          <button className="btn btn-danger btn-sm" disabled={joinLinkBusy} onClick={() => handleRevokeJoinLink(link.id)}>撤销</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "requirements" && (
            <div className="tab-pane-requirements">
              <h3>学生要求</h3>
              <p className="hint-text">查看家长或学生针对本节课提出的具体要求。</p>
              
              <div className="remarks-display mt-16">
                {course.studentRemarks ? (
                  <div className="remarks-bubble">
                    <span className="quote-icon">“</span>
                    <p>{course.studentRemarks}</p>
                    <span className="quote-icon end">”</span>
                  </div>
                ) : (
                  <p className="empty-hint">学生暂未提交任何要求。</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
