"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// Room type options
const ROOM_TYPES = [
  { value: 0, label: "一对一课堂", desc: "1v1 私教模式" },
  { value: 4, label: "小班课", desc: "适合 2~16 人" },
  { value: 2, label: "大班课", desc: "适合大规模直播教学" },
];

// Generate a short room ID
function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"teacher" | "student">("teacher");
  const [loading, setLoading] = useState(false);

  // Teacher form
  const [teacherName, setTeacherName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState(0);
  const [generatedRoomId, setGeneratedRoomId] = useState("");

  // Student form
  const [studentName, setStudentName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");

  // Create classroom (teacher)
  const handleCreateRoom = useCallback(async () => {
    if (!teacherName.trim() || !roomName.trim()) return;

    setLoading(true);
    try {
      const roomUuid = generateRoomId();
      setGeneratedRoomId(roomUuid);

      // Generate a user UUID from teacher name
      const userUuid = `teacher_${teacherName.trim().replace(/\s+/g, "_")}`;

      const params = new URLSearchParams({
        roomUuid,
        userUuid,
        userName: teacherName.trim(),
        roleType: "1", // Teacher
        roomType: String(roomType),
        roomName: roomName.trim(),
      });

      router.push(`/classroom?${params.toString()}`);
    } catch {
      setLoading(false);
    }
  }, [teacherName, roomName, roomType, router]);

  // Join classroom (student)
  const handleJoinRoom = useCallback(async () => {
    if (!studentName.trim() || !joinRoomId.trim()) return;

    setLoading(true);
    try {
      const userUuid = `student_${studentName.trim().replace(/\s+/g, "_")}_${Date.now().toString(36)}`;

      const params = new URLSearchParams({
        roomUuid: joinRoomId.trim(),
        userUuid,
        userName: studentName.trim(),
        roleType: "2", // Student
        roomType: String(roomType),
        roomName: joinRoomId.trim(),
      });

      router.push(`/classroom?${params.toString()}`);
    } catch {
      setLoading(false);
    }
  }, [studentName, joinRoomId, roomType, router]);

  // Copy room ID
  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(generatedRoomId);
  };

  return (
    <>
      <div className="page-bg" />

      <div className="container">
        {/* Header */}
        <header className="header animate-in">
          <div className="logo-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1>灵动课堂</h1>
          <p>实时互动 · 沉浸教学 · 声网驱动</p>
        </header>

        {/* Main Card */}
        <div className="card animate-in animate-in-delay-1">
          {/* Tabs */}
          <div className="tabs" role="tablist">
            <button
              className={`tab-btn ${activeTab === "teacher" ? "active" : ""}`}
              onClick={() => setActiveTab("teacher")}
              role="tab"
              aria-selected={activeTab === "teacher"}
              id="tab-teacher"
            >
              <span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                老师
              </span>
            </button>
            <button
              className={`tab-btn ${activeTab === "student" ? "active" : ""}`}
              onClick={() => setActiveTab("student")}
              role="tab"
              aria-selected={activeTab === "student"}
              id="tab-student"
            >
              <span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                学生
              </span>
            </button>
          </div>

          {/* Teacher Form */}
          {activeTab === "teacher" && (
            <div key="teacher-form">
              <div className="form-group">
                <label className="form-label" htmlFor="teacher-name">
                  你的名字
                </label>
                <input
                  id="teacher-name"
                  className="form-input"
                  type="text"
                  placeholder="输入老师姓名"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="room-name">
                  课堂名称
                </label>
                <input
                  id="room-name"
                  className="form-input"
                  type="text"
                  placeholder="例如：高一数学第三章"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="room-type">
                  课堂类型
                </label>
                <select
                  id="room-type"
                  className="form-select"
                  value={roomType}
                  onChange={(e) => setRoomType(Number(e.target.value))}
                >
                  {ROOM_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label} — {rt.desc}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleCreateRoom}
                disabled={loading || !teacherName.trim() || !roomName.trim()}
                id="btn-create-room"
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    正在创建…
                  </>
                ) : (
                  "创建课堂"
                )}
              </button>

              {generatedRoomId && (
                <div className="room-badge">
                  <span className="room-badge-label">房间 ID</span>
                  <span className="room-badge-id">{generatedRoomId}</span>
                  <button onClick={handleCopyRoomId}>复制</button>
                </div>
              )}
            </div>
          )}

          {/* Student Form */}
          {activeTab === "student" && (
            <div key="student-form">
              <div className="form-group">
                <label className="form-label" htmlFor="student-name">
                  你的名字
                </label>
                <input
                  id="student-name"
                  className="form-input"
                  type="text"
                  placeholder="输入学生姓名"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="join-room-id">
                  房间 ID
                </label>
                <input
                  id="join-room-id"
                  className="form-input"
                  type="text"
                  placeholder="输入老师分享的房间 ID"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="room-type-student">
                  课堂类型
                </label>
                <select
                  id="room-type-student"
                  className="form-select"
                  value={roomType}
                  onChange={(e) => setRoomType(Number(e.target.value))}
                >
                  {ROOM_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label} — {rt.desc}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-secondary"
                onClick={handleJoinRoom}
                disabled={
                  loading || !studentName.trim() || !joinRoomId.trim()
                }
                id="btn-join-room"
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    正在加入…
                  </>
                ) : (
                  "加入课堂"
                )}
              </button>
            </div>
          )}
        </div>

        {/* Feature Highlights */}
        <div className="features animate-in animate-in-delay-2">
          <div className="feature">
            <div className="feature-icon">📹</div>
            <div className="feature-text">实时音视频</div>
          </div>
          <div className="feature">
            <div className="feature-icon">📝</div>
            <div className="feature-text">互动白板</div>
          </div>
          <div className="feature">
            <div className="feature-icon">💬</div>
            <div className="feature-text">即时消息</div>
          </div>
        </div>

        {/* Footer */}
        <footer className="footer animate-in animate-in-delay-3">
          Powered by{" "}
          <a
            href="https://www.shengwang.cn/"
            target="_blank"
            rel="noopener noreferrer"
          >
            声网 Agora
          </a>{" "}
          · 灵动课堂 SDK
        </footer>
      </div>
    </>
  );
}
