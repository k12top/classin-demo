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
import {
  buildAccessDeniedUrl,
  type CourseAccessDeniedCode,
} from "@/lib/access-denied-codes";
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
  network: {
    uplinkQuality: 0,
    downlinkQuality: 0,
    latencyMs: null,
    packetLossPercent: null,
  },
  local: {
    microphoneOn: false,
    cameraOn: false,
    screenSharing: false,
    videoQuality: "hd",
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
  const { t } = useTranslation();
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !participant.hasVideo) return;
    provider.attachVideo(participant.id, element);
    return () => provider.detachVideo(participant.id, element);
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
      aria-label={t("classroom.v3.spotlightMember", {
        name: participant.displayName,
      })}
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
              ? t("classroom.v3.screenSharing")
              : participant.isLocal
                ? t("classroom.v3.me")
                : t("classroom.v3.members")}
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
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
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
  const [mediaProvider, setMediaProvider] =
    useState<ClassroomMediaProvider | null>(null);
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
    const currentUser = user;
    if (!currentUser) {
      redirectToSsoLogin();
      return;
    }
    if (!courseId) return;
    const currentUserDisplayName =
      currentUser.displayName || currentUser.name || currentUser.userId;

    let cancelled = false;
    let createdProvider: ClassroomMediaProvider | null = null;

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
                code:
                  (payload.code as CourseAccessDeniedCode | undefined) ||
                  "default",
                reason: payload.error || t("classroom.v3.accessDenied"),
                courseId,
              }),
            );
            return;
          }
          throw new Error(
            ("error" in payload && payload.error) ||
              t("classroom.v3.sessionCreateFailed"),
          );
        }
        if (cancelled) return;

        setSessionData(payload);
        setRecordingStatus(payload.recording.status);
        isTeacherRef.current =
          payload.credential.role === "teacher" ||
          payload.credential.role === "assistant";
        createdProvider = await createClassroomMediaProvider(
          payload.credential.provider,
        );
        providerRef.current = createdProvider;
        setMediaProvider(createdProvider);
        const unsubscribe = createdProvider.subscribe((snapshot) => {
          if (!cancelled) setMedia(snapshot);
        });

        try {
          await createdProvider.connect(
            payload.credential,
            currentUserDisplayName,
          );
        } catch (error) {
          unsubscribe();
          throw error;
        }
        if (cancelled) {
          unsubscribe();
          await createdProvider.disconnect();
          return;
        }
        setLoadingState("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[classroom] launch failed", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t("classroom.v3.classroomLaunchFailed"),
        );
        setLoadingState("error");
      }
    }

    void launch();
    return () => {
      cancelled = true;
      reportAttendanceLeave();
      if (createdProvider) void createdProvider.disconnect();
      if (providerRef.current === createdProvider) providerRef.current = null;
    };
  }, [
    authLoading,
    courseId,
    reportAttendanceLeave,
    router,
    shareAccess,
    t,
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
          error instanceof Error
            ? error.message
            : t("classroom.v3.mediaActionFailed"),
        );
      } finally {
        setActionBusy(null);
      }
    },
    [actionBusy, t],
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
        throw new Error(payload.error || t("classroom.v3.recordingActionFailed"));
      }
      setRecordingStatus(payload.recording?.status ?? null);
    } catch (error) {
      setActionError(
          error instanceof Error
            ? error.message
            : t("classroom.v3.recordingActionFailed"),
      );
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, courseId, recordingStatus, t]);

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

  if (loadingState === "loading" && courseId) {
    return (
      <PageLoadingState
        message={t("classroom.v3.entering")}
        variant="classroom"
      />
    );
  }

  if (
    !courseId ||
    loadingState === "error" ||
    !sessionData ||
    !mediaProvider
  ) {
    return (
      <main className="classroom-v2-shell grid place-items-center p-6">
        <section className="w-full max-w-md rounded-3xl border border-rose-400/20 bg-slate-950/80 p-8 text-center shadow-2xl backdrop-blur">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-400" />
          <h1 className="mt-5 text-2xl font-semibold text-white">
            {t("classroom.v3.cannotEnter")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {courseId
              ? errorMessage
              : t("classroom.v3.missingCourse")}
          </p>
          <button
            type="button"
            onClick={() => router.push(courseId ? `/courses/${courseId}` : "/")}
            className="mt-7 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white outline-none transition hover:bg-violet-400 focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            {t("classroom.v3.backToCourse")}
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
              ? t("classroom.v3.connected")
              : t("classroom.v3.reconnecting")}
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
              provider={mediaProvider}
              selected
              onSelect={() => undefined}
            />
          ) : (
            <div className="grid h-full min-h-[280px] place-items-center rounded-[22px] border border-dashed border-white/15 bg-slate-950/60 text-center">
              <div>
                <Presentation className="mx-auto h-10 w-10 text-violet-300/70" />
                <p className="mt-4 text-sm font-medium text-white">
                  {t("classroom.v3.connected")}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {isTeacher
                    ? t("classroom.v3.startTeaching")
                    : t("classroom.v3.waitForTeacher")}
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
                provider={mediaProvider}
                selected={false}
                compact
                onSelect={() =>
                  void mediaProvider.focusParticipant(participant.id)
                }
              />
            </div>
          ))}
          {filmstripParticipants.length === 0 && selectedParticipant && (
            <div className="hidden rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500 md:block">
              {t("classroom.v3.stageWaiting")}
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
                  <span>{t("classroom.v3.microphone")}</span>
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
                  <span>{t("classroom.v3.camera")}</span>
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
                  <span>{t("classroom.v3.screenShare")}</span>
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
                    : t("classroom.v3.recordingNotConfigured")
                }
              >
                {recordingActive ? (
                  <CircleStop className="h-5 w-5" />
                ) : (
                  <Radio className="h-5 w-5" />
                )}
                <span>
                  {recordingActive
                    ? t("classroom.v3.stopRecording")
                    : t("classroom.v3.startRecording")}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void leaveClassroom()}
              className="classroom-v2-control"
            >
              <LogOut className="h-5 w-5" />
              <span>{t("classroom.v3.leave")}</span>
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default function ClassroomV2() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <PageLoadingState
          message={t("classroom.v3.entering")}
          variant="classroom"
        />
      }
    >
      <ClassroomContent />
    </Suspense>
  );
}
