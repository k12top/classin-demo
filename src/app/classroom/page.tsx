"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CircleStop,
  LogOut,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Presentation,
  Radio,
  ScreenShareOff,
  Users,
  Video,
  VideoOff,
  Wifi,
} from "lucide-react";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { useAuth } from "@/lib/auth-context";
import { createClassroomMediaProvider } from "@/lib/classroom/client/provider-factory";
import type {
  ClassroomMediaProvider,
  ClassroomMediaSnapshot,
  ClassroomParticipant,
  ClassroomSessionResponse,
} from "@/lib/classroom/types";
import { useTranslation } from "@/lib/i18n/context";

type LoadingState = "loading" | "ready" | "error";

const EMPTY_MEDIA_SNAPSHOT: ClassroomMediaSnapshot = {
  connectionState: "idle",
  participants: [],
  local: {
    microphoneOn: false,
    cameraOn: false,
    screenSharing: false,
  },
  focusedParticipantId: null,
};

function VideoSurface({
  participant,
  provider,
  selected,
  onSelect,
  compact = false,
}: {
  participant: ClassroomParticipant;
  provider: ClassroomMediaProvider;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !participant.hasVideo) return;
    provider.attachVideo(participant.id, element);
    return () => provider.detachVideo(participant.id);
  }, [participant.hasVideo, participant.id, provider]);

  const initial = participant.displayName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group relative w-full overflow-hidden text-left outline-none transition",
        compact
          ? "aspect-video rounded-xl bg-slate-900"
          : "h-full min-h-[280px] rounded-[22px] bg-slate-950",
        selected
          ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-[#11182a]"
          : "ring-1 ring-white/10 hover:ring-white/30",
      ].join(" ")}
      aria-label={`放大 ${participant.displayName}`}
    >
      <div ref={videoRef} className="absolute inset-0" />
      {!participant.hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,92,255,0.25),transparent_55%)]">
          <div
            className={[
              "grid place-items-center rounded-full border border-white/15 bg-white/10 font-semibold text-white shadow-2xl",
              compact ? "h-12 w-12 text-lg" : "h-24 w-24 text-4xl",
            ].join(" ")}
          >
            {initial}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 via-black/25 to-transparent px-3 pb-3 pt-10">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {participant.displayName}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
            {participant.kind === "screen"
              ? "Screen"
              : participant.isLocal
                ? "You"
                : "Participant"}
          </p>
        </div>
        {!compact && participant.kind !== "screen" && (
          <Maximize2 className="h-4 w-4 text-white/60 opacity-0 transition group-hover:opacity-100" />
        )}
      </div>
    </button>
  );
}

function ClassroomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const isZh = locale === "zh-CN";
  const courseId = searchParams.get("courseId") || "";
  const shareAccess = searchParams.get("shareAccess") || "";
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionData, setSessionData] =
    useState<ClassroomSessionResponse | null>(null);
  const [media, setMedia] =
    useState<ClassroomMediaSnapshot>(EMPTY_MEDIA_SNAPSHOT);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const providerRef = useRef<ClassroomMediaProvider | null>(null);
  const courseIdRef = useRef(courseId);
  const isTeacherRef = useRef(false);

  useEffect(() => {
    courseIdRef.current = courseId;
  }, [courseId]);

  const reportAttendanceLeave = useCallback(() => {
    if (!courseIdRef.current || isTeacherRef.current) return;
    void fetch(`/api/courses/${encodeURIComponent(courseIdRef.current)}/attendance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "leave" }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      redirectToSsoLogin();
      return;
    }
    if (!courseId) {
      setErrorMessage(
        isZh ? "缺少课程 ID，请从课程详情进入课堂。" : "Missing course ID.",
      );
      setLoadingState("error");
      return;
    }

    let cancelled = false;
    let provider: ClassroomMediaProvider | null = null;

    async function launch() {
      try {
        let response = await fetch("/api/classroom/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            ...(shareAccess && { shareAccess }),
          }),
        });
        if (response.status === 401 && (await tryOAuthRefresh())) {
          response = await fetch("/api/classroom/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              courseId,
              ...(shareAccess && { shareAccess }),
            }),
          });
        }
        if (response.status === 401) {
          redirectToSsoLogin();
          return;
        }

        const payload = (await response.json()) as
          | ClassroomSessionResponse
          | { error?: string; code?: string };
        if (!response.ok || !("credential" in payload)) {
          if (response.status === 403 && "code" in payload) {
            router.replace(
              buildAccessDeniedUrl({
                code: payload.code || "default",
                reason: payload.error || "无权进入课堂",
                courseId,
              }),
            );
            return;
          }
          throw new Error(
            ("error" in payload && payload.error) || "无法创建课堂会话",
          );
        }
        if (cancelled) return;

        setSessionData(payload);
        setRecordingStatus(payload.recording.status);
        isTeacherRef.current =
          payload.credential.role === "teacher" ||
          payload.credential.role === "assistant";
        provider = createClassroomMediaProvider(payload.credential.provider);
        providerRef.current = provider;
        const unsubscribe = provider.subscribe((snapshot) => {
          if (!cancelled) setMedia(snapshot);
        });

        try {
          await provider.connect(
            payload.credential,
            user.displayName || user.name || user.userId,
          );
        } catch (error) {
          unsubscribe();
          throw error;
        }
        if (cancelled) {
          unsubscribe();
          await provider.disconnect();
          return;
        }
        setLoadingState("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[classroom] launch failed", error);
        setErrorMessage(
          error instanceof Error ? error.message : "无法启动课堂",
        );
        setLoadingState("error");
      }
    }

    void launch();
    return () => {
      cancelled = true;
      reportAttendanceLeave();
      if (provider) void provider.disconnect();
      if (providerRef.current === provider) providerRef.current = null;
    };
  }, [
    authLoading,
    courseId,
    isZh,
    reportAttendanceLeave,
    router,
    shareAccess,
    user,
  ]);

  useEffect(() => {
    const onPageHide = () => reportAttendanceLeave();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [reportAttendanceLeave]);

  const selectedParticipant = useMemo(() => {
    const focused = media.participants.find(
      (participant) => participant.id === media.focusedParticipantId,
    );
    return (
      focused ||
      media.participants.find(
        (participant) =>
          participant.kind === "screen" && participant.hasVideo,
      ) ||
      media.participants.find((participant) => participant.hasVideo) ||
      media.participants[0] ||
      null
    );
  }, [media.focusedParticipantId, media.participants]);

  const filmstripParticipants = useMemo(
    () =>
      media.participants.filter(
        (participant) => participant.id !== selectedParticipant?.id,
      ),
    [media.participants, selectedParticipant?.id],
  );

  const runMediaAction = useCallback(
    async (name: string, action: (provider: ClassroomMediaProvider) => Promise<unknown>) => {
      const provider = providerRef.current;
      if (!provider || actionBusy) return;
      setActionBusy(name);
      setActionError("");
      try {
        await action(provider);
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "课堂操作失败",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [actionBusy],
  );

  const toggleRecording = useCallback(async () => {
    if (!courseId || actionBusy) return;
    const active =
      recordingStatus === "recording" ||
      recordingStatus === "starting" ||
      recordingStatus === "stopping";
    setActionBusy("recording");
    setActionError("");
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/recording`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: active ? "stop" : "start" }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        recording?: { status?: string } | null;
      };
      if (!response.ok) {
        throw new Error(payload.error || "录制操作失败");
      }
      setRecordingStatus(payload.recording?.status ?? null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "录制操作失败",
      );
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, courseId, recordingStatus]);

  const leaveClassroom = useCallback(async () => {
    reportAttendanceLeave();
    await providerRef.current?.disconnect();
    providerRef.current = null;
    window.location.replace(
      courseId
        ? `/courses/${encodeURIComponent(courseId)}`
        : "/",
    );
  }, [courseId, reportAttendanceLeave]);

  if (loadingState === "loading") {
    return (
      <PageLoadingState
        message={isZh ? "正在建立课堂连接…" : "Connecting to classroom…"}
        variant="classroom"
      />
    );
  }

  if (loadingState === "error" || !sessionData) {
    return (
      <main className="classroom-v2-shell grid place-items-center p-6">
        <section className="w-full max-w-md rounded-3xl border border-rose-400/20 bg-slate-950/80 p-8 text-center shadow-2xl backdrop-blur">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-400" />
          <h1 className="mt-5 text-2xl font-semibold text-white">
            {isZh ? "无法进入课堂" : "Unable to enter classroom"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => router.push(courseId ? `/courses/${courseId}` : "/")}
            className="mt-7 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white outline-none transition hover:bg-violet-400 focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            {isZh ? "返回课程" : "Back to course"}
          </button>
        </section>
      </main>
    );
  }

  const isTeacher =
    sessionData.credential.role === "teacher" ||
    sessionData.credential.role === "assistant";
  const recordingActive =
    recordingStatus === "recording" ||
    recordingStatus === "starting" ||
    recordingStatus === "stopping";

  return (
    <main className="classroom-v2-shell">
      <div
        className={[
          "classroom-v2-pulse",
          media.connectionState === "connected"
            ? recordingActive
              ? "is-recording"
              : "is-connected"
            : "",
        ].join(" ")}
      />

      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Presentation className="h-4 w-4 text-violet-300" />
            <h1 className="truncate text-sm font-semibold text-white md:text-base">
              {sessionData.course.name}
            </h1>
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-400">
            {sessionData.course.teacherName} · {sessionData.credential.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 sm:flex">
            <Wifi
              className={[
                "h-3.5 w-3.5",
                media.connectionState === "connected"
                  ? "text-emerald-400"
                  : "text-amber-400",
              ].join(" ")}
            />
            {media.connectionState === "connected"
              ? isZh
                ? "连接正常"
                : "Connected"
              : media.connectionState}
          </div>
          {recordingActive && (
            <div className="flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              REC
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            <Users className="h-3.5 w-3.5" />
            {media.participants.length}
          </div>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-4">
        <div className="relative min-h-0 flex-1">
          {selectedParticipant ? (
            <VideoSurface
              participant={selectedParticipant}
              provider={providerRef.current!}
              selected
              onSelect={() => undefined}
            />
          ) : (
            <div className="grid h-full min-h-[280px] place-items-center rounded-[22px] border border-dashed border-white/15 bg-slate-950/60 text-center">
              <div>
                <Presentation className="mx-auto h-10 w-10 text-violet-300/70" />
                <p className="mt-4 text-sm font-medium text-white">
                  {isZh ? "课堂已连接" : "Classroom connected"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {isTeacher
                    ? isZh
                      ? "开启摄像头或共享屏幕开始授课"
                      : "Turn on camera or share your screen"
                    : isZh
                      ? "等待老师开始授课"
                      : "Waiting for the teacher"}
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="flex shrink-0 gap-2 overflow-x-auto pb-1 md:w-56 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pb-0">
          {filmstripParticipants.map((participant) => (
            <div key={participant.id} className="w-44 shrink-0 md:w-full">
              <VideoSurface
                participant={participant}
                provider={providerRef.current!}
                selected={false}
                compact
                onSelect={() =>
                  void providerRef.current?.focusParticipant(participant.id)
                }
              />
            </div>
          ))}
          {filmstripParticipants.length === 0 && selectedParticipant && (
            <div className="hidden rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500 md:block">
              {isZh ? "其他成员将显示在这里" : "Other participants appear here"}
            </div>
          )}
        </aside>
      </section>

      {actionError && (
        <div className="mx-4 mb-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-center text-xs text-rose-200">
          {actionError}
        </div>
      )}

      <footer className="shrink-0 border-t border-white/10 bg-[#0b1020]/95 px-3 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            {isTeacher && (
              <>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void runMediaAction("microphone", (provider) =>
                      provider.toggleMicrophone(),
                    )
                  }
                  className="classroom-v2-control"
                >
                  {media.local.microphoneOn ? (
                    <Mic className="h-5 w-5" />
                  ) : (
                    <MicOff className="h-5 w-5" />
                  )}
                  <span>{isZh ? "麦克风" : "Mic"}</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void runMediaAction("camera", (provider) =>
                      provider.toggleCamera(),
                    )
                  }
                  className="classroom-v2-control"
                >
                  {media.local.cameraOn ? (
                    <Video className="h-5 w-5" />
                  ) : (
                    <VideoOff className="h-5 w-5" />
                  )}
                  <span>{isZh ? "摄像头" : "Camera"}</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void runMediaAction("screen", (provider) =>
                      media.local.screenSharing
                        ? provider.stopScreenShare()
                        : provider.startScreenShare(),
                    )
                  }
                  className="classroom-v2-control"
                >
                  {media.local.screenSharing ? (
                    <ScreenShareOff className="h-5 w-5" />
                  ) : (
                    <MonitorUp className="h-5 w-5" />
                  )}
                  <span>{isZh ? "共享屏幕" : "Share"}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isTeacher && (
              <button
                type="button"
                disabled={
                  Boolean(actionBusy) || !sessionData.recording.enabled
                }
                onClick={() => void toggleRecording()}
                className={[
                  "classroom-v2-control",
                  recordingActive ? "is-danger" : "is-primary",
                ].join(" ")}
                title={
                  sessionData.recording.enabled
                    ? undefined
                    : isZh
                      ? "云端录制尚未配置"
                      : "Cloud recording is not configured"
                }
              >
                {recordingActive ? (
                  <CircleStop className="h-5 w-5" />
                ) : (
                  <Radio className="h-5 w-5" />
                )}
                <span>
                  {recordingActive
                    ? isZh
                      ? "结束并保存"
                      : "Stop & save"
                    : isZh
                      ? "开始上课"
                      : "Start class"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void leaveClassroom()}
              className="classroom-v2-control"
            >
              <LogOut className="h-5 w-5" />
              <span>{isZh ? "离开" : "Leave"}</span>
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default function ClassroomPage() {
  const { locale } = useTranslation();
  return (
    <Suspense
      fallback={
        <PageLoadingState
          message={
            locale === "zh-CN"
              ? "正在准备在线课堂…"
              : "Preparing classroom…"
          }
          variant="classroom"
        />
      }
    >
      <ClassroomContent />
    </Suspense>
  );
}

