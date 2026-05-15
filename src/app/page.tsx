"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for shared join link: /?join=roomId&roomType=0&roomName=xxx
  const joinParam = searchParams.get("join");
  const joinRoomTypeParam = searchParams.get("roomType");
  const joinRoomNameParam = searchParams.get("roomName");

  const [activeTab, setActiveTab] = useState<"teacher" | "student">(
    joinParam ? "student" : "teacher"
  );
  const [loading, setLoading] = useState(false);

  // Teacher form
  const [teacherName, setTeacherName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState(0);

  // Room created state (shown after teacher creates a room, before entering)
  const [createdRoom, setCreatedRoom] = useState<{
    roomUuid: string;
    roomName: string;
    roomType: number;
    teacherName: string;
    shareUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState<"id" | "link" | null>(null);

  // Student form
  const [studentName, setStudentName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState(joinParam || "");
  const [studentRoomType, setStudentRoomType] = useState(
    joinRoomTypeParam ? Number(joinRoomTypeParam) : 0
  );

  // Auto-fill from share link
  useEffect(() => {
    if (joinParam) {
      setJoinRoomId(joinParam);
      setActiveTab("student");
      if (joinRoomTypeParam) setStudentRoomType(Number(joinRoomTypeParam));
    }
  }, [joinParam, joinRoomTypeParam]);

  // Create classroom (teacher) — show room info, don't navigate yet
  const handleCreateRoom = useCallback(() => {
    if (!teacherName.trim() || !roomName.trim()) return;

    const roomUuid = generateRoomId();
    const origin = window.location.origin;
    const shareUrl = `${origin}/?join=${roomUuid}&roomType=${roomType}&roomName=${encodeURIComponent(roomName.trim())}`;

    setCreatedRoom({
      roomUuid,
      roomName: roomName.trim(),
      roomType,
      teacherName: teacherName.trim(),
      shareUrl,
    });
  }, [teacherName, roomName, roomType]);

  // Teacher enters the created classroom
  const handleEnterRoom = useCallback(() => {
    if (!createdRoom) return;
    setLoading(true);

    const userUuid = `teacher_${createdRoom.teacherName.replace(/\s+/g, "_")}`;
    const params = new URLSearchParams({
      roomUuid: createdRoom.roomUuid,
      userUuid,
      userName: createdRoom.teacherName,
      roleType: "1",
      roomType: String(createdRoom.roomType),
      roomName: createdRoom.roomName,
    });

    router.push(`/classroom?${params.toString()}`);
  }, [createdRoom, router]);

  // Back to form from created room view
  const handleBackToForm = useCallback(() => {
    setCreatedRoom(null);
  }, []);

  // Join classroom (student)
  const handleJoinRoom = useCallback(() => {
    if (!studentName.trim() || !joinRoomId.trim()) return;

    setLoading(true);
    const userUuid = `student_${studentName.trim().replace(/\s+/g, "_")}_${Date.now().toString(36)}`;
    const finalRoomName = joinRoomNameParam || joinRoomId.trim();

    const params = new URLSearchParams({
      roomUuid: joinRoomId.trim(),
      userUuid,
      userName: studentName.trim(),
      roleType: "2",
      roomType: String(studentRoomType),
      roomName: finalRoomName,
    });

    router.push(`/classroom?${params.toString()}`);
  }, [studentName, joinRoomId, studentRoomType, joinRoomNameParam, router]);

  // Copy helpers
  const handleCopy = (text: string, type: "id" | "link") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <div className="page-bg" />

      <div className="container">


        {/* ──────────── Room Created Card ──────────── */}
        {createdRoom ? (
          <div className="card animate-in animate-in-delay-1">
            <div className="room-created-header">
              <div className="room-created-icon">✅</div>
              <h2 className="room-created-title">课堂已创建</h2>
              <p className="room-created-subtitle">{createdRoom.roomName}</p>
            </div>

            {/* Big Room ID */}
            <div className="room-id-display">
              <div className="room-id-label">房间号</div>
              <div className="room-id-value">{createdRoom.roomUuid}</div>
              <button
                className="room-id-copy"
                onClick={() => handleCopy(createdRoom.roomUuid, "id")}
              >
                {copied === "id" ? "✓ 已复制" : "复制房间号"}
              </button>
            </div>

            {/* Share Link */}
            <div className="share-section">
              <div className="form-label">分享链接（学生可直接打开加入）</div>
              <div className="share-link-box">
                <input
                  className="form-input share-link-input"
                  readOnly
                  value={createdRoom.shareUrl}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="share-link-btn"
                  onClick={() => handleCopy(createdRoom.shareUrl, "link")}
                >
                  {copied === "link" ? "✓" : "复制"}
                </button>
              </div>
            </div>

            {/* Room info */}
            <div className="room-meta">
              <div className="room-meta-item">
                <span className="room-meta-label">课堂类型</span>
                <span className="room-meta-value">
                  {ROOM_TYPES.find((r) => r.value === createdRoom.roomType)
                    ?.label || "未知"}
                </span>
              </div>
              <div className="room-meta-item">
                <span className="room-meta-label">老师</span>
                <span className="room-meta-value">
                  {createdRoom.teacherName}
                </span>
              </div>
            </div>

            {/* Actions */}
            <button
              className="btn btn-primary"
              onClick={handleEnterRoom}
              disabled={loading}
              id="btn-enter-room"
              style={{ marginTop: "20px" }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  正在进入…
                </>
              ) : (
                "进入课堂"
              )}
            </button>

            <button
              className="btn-link"
              onClick={handleBackToForm}
              style={{ marginTop: "12px" }}
            >
              ← 返回重新创建
            </button>
          </div>
        ) : (
          /* ──────────── Normal Form Card ──────────── */
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
                  disabled={!teacherName.trim() || !roomName.trim()}
                  id="btn-create-room"
                >
                  创建课堂
                </button>
              </div>
            )}

            {/* Student Form */}
            {activeTab === "student" && (
              <div key="student-form">
                {/* Show a hint if arrived via share link */}
                {joinParam && joinRoomNameParam && (
                  <div className="join-hint">
                    你被邀请加入：<strong>{decodeURIComponent(joinRoomNameParam)}</strong>
                  </div>
                )}

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
                    autoFocus={!!joinParam}
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
                    readOnly={!!joinParam}
                    style={joinParam ? { opacity: 0.7 } : undefined}
                  />
                </div>

                {!joinParam && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="room-type-student">
                      课堂类型
                    </label>
                    <select
                      id="room-type-student"
                      className="form-select"
                      value={studentRoomType}
                      onChange={(e) =>
                        setStudentRoomType(Number(e.target.value))
                      }
                    >
                      {ROOM_TYPES.map((rt) => (
                        <option key={rt.value} value={rt.value}>
                          {rt.label} — {rt.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
        )}

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

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
