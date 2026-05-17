"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROOM_TYPE_LABELS: Record<number, string> = {
  0: "一对一课堂",
  4: "小班课",
  2: "大班课",
};

export default function StudentCourseDetail({ 
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"info" | "requirements">("info");
  const [remarksValue, setRemarksValue] = useState(course.studentRemarks || "");
  const [savingRemarks, setSavingRemarks] = useState(false);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "未定";
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  };

  const handleSaveRemarks = async () => {
    setSavingRemarks(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRemarks: remarksValue })
      });
      if (res.ok) {
        fetchCourse();
        alert("已更新要求！");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRemarks(false);
    }
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
            <span className="meta-icon">👨‍🏫</span>
            <span>授课教师：<strong>{course.teacherName}</strong></span>
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
            className={`detail-tab ${activeTab === "info" ? "active" : ""}`} 
            onClick={() => setActiveTab("info")}
          >
            📖 课程信息
          </button>
          <button 
            className={`detail-tab ${activeTab === "requirements" ? "active" : ""}`} 
            onClick={() => setActiveTab("requirements")}
          >
            📝 我的要求
          </button>
        </div>

        <div className="detail-tab-content card">
          {activeTab === "info" && (
            <div className="tab-pane-info">
              <h3>课程描述</h3>
              <p className="desc-text">{course.description || "老师暂未提供详细描述。"}</p>
              
              <div className="info-block" style={{marginTop: '24px'}}>
                 <h4>课件材料</h4>
                 <p className="empty-hint">暂无课件上传功能</p>
              </div>
            </div>
          )}

          {activeTab === "requirements" && (
            <div className="tab-pane-requirements">
              <h3>想给老师提什么要求？</h3>
              <p className="hint-text">您可以写下希望老师在课堂上注意的事项，例如：多纠正发音、少做游戏等。</p>
              
              <textarea 
                className="form-input form-textarea mt-16"
                rows={4}
                value={remarksValue}
                onChange={e => setRemarksValue(e.target.value)}
                placeholder="在此填写..."
              />
              <button 
                className="btn btn-primary mt-16" 
                onClick={handleSaveRemarks}
                disabled={savingRemarks}
              >
                {savingRemarks ? "保存中..." : "保存要求"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
