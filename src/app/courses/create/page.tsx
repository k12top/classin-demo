"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const ROOM_TYPES = [
  { value: 0, label: "一对一课堂", desc: "1v1 私教模式", icon: "👤" },
  { value: 4, label: "小班课", desc: "适合 2~16 人", icon: "👥" },
  { value: 2, label: "大班课", desc: "适合大规模直播教学", icon: "🏫" },
];

export default function CreateCoursePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState(0);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (!startTime) {
      setError("请选择课程开始时间");
      return;
    }
    if (!endTime) {
      setError("请选择课程结束时间");
      return;
    }
    if (new Date(endTime) <= new Date(startTime)) {
      setError("结束时间必须晚于开始时间");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, 
          description, 
          roomType,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString()
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "创建失败");
      }

      const { course } = await res.json();
      router.push(`/courses/${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建课程失败");
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== "teacher") {
    return (
      <>
        <div className="page-bg" />
        <div className="auth-container">
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <h2>⚠️ 权限不足</h2>
            <p style={{ color: "var(--color-text-secondary)", marginTop: 8 }}>
              只有老师才能创建课程
            </p>
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
      <div className="auth-container">
        {/* Back button */}
        <button className="btn-link" onClick={() => router.push("/")} style={{ textAlign: "left", marginBottom: 16 }}>
          ← 返回课程列表
        </button>

        <div className="card animate-in animate-in-delay-1">
          <h2 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>创建新课程</h2>

          {error && (
            <div className="login-error" style={{ marginBottom: 16 }}>
              <span>⚠️</span> <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="course-name">课程名称</label>
            <input
              id="course-name"
              className="form-input"
              type="text"
              placeholder="例如：高一数学第三章"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="course-desc">课程描述（可选）</label>
            <textarea
              id="course-desc"
              className="form-input form-textarea"
              placeholder="简要描述课程内容"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
            />
          </div>

          <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="course-start">开始时间</label>
              <input
                id="course-start"
                className="form-input"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="course-end">结束时间</label>
              <input
                id="course-end"
                className="form-input"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">课堂类型</label>
            <div className="room-type-grid">
              {ROOM_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  className={`room-type-option ${roomType === rt.value ? "selected" : ""}`}
                  onClick={() => setRoomType(rt.value)}
                  type="button"
                >
                  <span className="room-type-option-icon">{rt.icon}</span>
                  <span className="room-type-option-label">{rt.label}</span>
                  <span className="room-type-option-desc">{rt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            id="btn-submit-course"
          >
            {loading ? (
              <>
                <span className="spinner" />
                创建中…
              </>
            ) : (
              "创建课程"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
