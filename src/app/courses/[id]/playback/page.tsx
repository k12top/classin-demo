"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, ChevronLeft, Clock3, Loader2, PlayCircle, ShieldCheck, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAuth } from "@/lib/auth-context";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { useTranslation } from "@/lib/i18n/context";
import { isHlsPlaybackUrl, isMp4PlaybackUrl } from "@/lib/playback-url";

interface PlaybackCourse {
  id: string;
  name: string;
  teacherName: string;
  status: string;
  canTeach?: boolean;
  recordUrl?: string | null;
}

export default function CoursePlaybackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();
  const [course, setCourse] = useState<PlaybackCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = useMemo(() => {
    return {
      loading: t("playback.loading"),
      back: t("playback.backToCourse"),
      title: t("playback.title"),
      playableOnly: t("playback.playableOnly"),
      notFinished: t("playback.notFinished"),
      noUrl: t("playback.noUrl"),
      loadFailed: t("playback.loadFailed"),
      hlsUnsupported: t("playback.hlsUnsupported"),
      browserHint: t("playback.browserHint"),
      teacher: t("playback.teacher"),
    };
  }, [t]);

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      if (res.status === 401 && (await tryOAuthRefresh())) {
        res = await fetch(`/api/courses/${id}`, { credentials: "same-origin" });
      }
      if (res.status === 401) {
        redirectToSsoLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.course) {
        setError(copy.loadFailed);
        return;
      }
      setCourse(data.course);
    } catch {
      setError(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed, id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      redirectToSsoLogin();
      return;
    }
    queueMicrotask(() => {
      void fetchCourse();
    });
  }, [authLoading, fetchCourse, user]);

  const recordUrl = course?.recordUrl?.trim() || "";
  const canPlayMp4 = course?.status === "finished" && isMp4PlaybackUrl(recordUrl);
  const canPlayHls = course?.status === "finished" && isHlsPlaybackUrl(recordUrl);
  const canPlayInApp = canPlayMp4 || canPlayHls;
  const isTeacher = Boolean(course?.canTeach);

  if (authLoading || loading) {
    return <PageLoadingState message={copy.loading} variant="course" />;
  }

  const message =
    error ||
    (course?.status !== "finished"
      ? copy.notFinished
      : !recordUrl
        ? copy.noUrl
        : !canPlayInApp
          ? copy.playableOnly
          : "");

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 border-b border-border/60 bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/courses/${id}`)}
          >
            <ChevronLeft className="h-4 w-4" />
            {copy.back}
          </Button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Badge
              variant="secondary"
              className={`flex items-center gap-1.5 px-3 py-1 ${
                isTeacher
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {isTeacher ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isTeacher ? t("common.roleTeacher") : t("common.roleStudent")}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {user?.displayName || user?.name}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Card className="overflow-hidden border border-border/70 bg-card shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-4 border-b border-border/60 p-5">
              <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">
                {course?.name || copy.title}
              </h1>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {course?.teacherName && (
                  <Badge variant="outline" className="text-xs">
                    {copy.teacher}: {course.teacherName}
                  </Badge>
                )}
              </div>
            </div>

            {canPlayInApp ? (
              <div className="bg-black">
                <TrackedPlaybackVideo
                  courseId={id}
                  src={recordUrl}
                  isHls={canPlayHls}
                  trackProgress={!isTeacher}
                  locale={locale}
                  className="aspect-video w-full bg-black"
                  unsupportedMessage={copy.hlsUnsupported}
                />
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="rounded-full bg-amber-500/10 p-4 text-amber-500">
                  {message ? <AlertTriangle className="h-8 w-8" /> : <PlayCircle className="h-8 w-8" />}
                </div>
                <div className="max-w-md space-y-2">
                  <p className="text-base font-semibold text-foreground">
                    {message || copy.loadFailed}
                  </p>
                  <p className="text-sm text-muted-foreground">{copy.browserHint}</p>
                </div>
                {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

type TrackingSession = {
  sessionId: string;
  challenge: string;
};

type TrackingState = "idle" | "recording" | "paused" | "error" | "teacher";

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function TrackedPlaybackVideo({
  courseId,
  src,
  isHls,
  trackProgress,
  locale,
  className,
  unsupportedMessage,
}: {
  courseId: string;
  src: string;
  isHls: boolean;
  trackProgress: boolean;
  locale: string;
  className?: string;
  unsupportedMessage: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");
  const [watchedSec, setWatchedSec] = useState(0);
  const [trackingState, setTrackingState] = useState<TrackingState>(
    trackProgress ? "idle" : "teacher"
  );
  const sessionRef = useRef<TrackingSession | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  const setStateIfMounted = useCallback((state: TrackingState) => {
    if (mountedRef.current) setTrackingState(state);
  }, []);

  const requestTracking = useCallback(
    async (method: "POST" | "PATCH", body: Record<string, unknown>, keepalive = false) => {
      const request = () =>
        fetch(`/api/courses/${courseId}/playback-progress`, {
          method,
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          keepalive,
          body: JSON.stringify(body),
        });
      let response = await request();
      if (response.status === 401 && !keepalive && (await tryOAuthRefresh())) {
        response = await request();
      }
      return response;
    },
    [courseId]
  );

  const enqueue = useCallback((action: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(action, action).catch(() => {
      setStateIfMounted("error");
    });
  }, [setStateIfMounted]);

  const startSession = useCallback(async () => {
    const video = videoRef.current;
    if (
      !trackProgress ||
      sessionRef.current ||
      !video ||
      video.paused ||
      video.ended ||
      video.seeking ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const response = await requestTracking("POST", {
      positionSec: video.currentTime,
      playbackRate: video.playbackRate,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.tracked) {
      sessionRef.current = null;
      setStateIfMounted("error");
      return;
    }
    sessionRef.current = {
      sessionId: data.sessionId,
      challenge: data.challenge,
    };
    if (mountedRef.current && typeof data.totalDurationSec === "number") {
      setWatchedSec(data.totalDurationSec);
    }
    setStateIfMounted("recording");
  }, [requestTracking, setStateIfMounted, trackProgress]);

  const sendHeartbeat = useCallback(
    async (
      state: "playing" | "paused" | "waiting" | "seeking" | "hidden" | "ended",
      activeWindow = true
    ) => {
      const video = videoRef.current;
      const tracking = sessionRef.current;
      if (!trackProgress || !video || !tracking) return;

      const terminal = state !== "playing";
      const response = await requestTracking("PATCH", {
        ...tracking,
        state,
        activeWindow,
        positionSec: video.currentTime,
        playbackRate: video.playbackRate,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        sessionRef.current = null;
        setStateIfMounted("paused");
        return;
      }
      if (!response.ok || !data.tracked) {
        sessionRef.current = null;
        setStateIfMounted("error");
        return;
      }
      if (mountedRef.current && typeof data.totalDurationSec === "number") {
        setWatchedSec(data.totalDurationSec);
      }
      sessionRef.current = terminal
        ? null
        : { sessionId: tracking.sessionId, challenge: data.challenge };
      setStateIfMounted(terminal ? "paused" : "recording");
    },
    [requestTracking, setStateIfMounted, trackProgress]
  );

  const queueStart = useCallback(() => {
    enqueue(startSession);
  }, [enqueue, startSession]);

  const queueHeartbeat = useCallback(
    (state: "playing" | "paused" | "waiting" | "seeking" | "hidden" | "ended") => {
      enqueue(() => sendHeartbeat(state, true));
    },
    [enqueue, sendHeartbeat]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let hls: Hls | null = null;

    setError("");

    if (!isHls) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (destroyed) return;
        if (!Hls.isSupported()) {
          setError(unsupportedMessage);
          return;
        }

        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      })
      .catch(() => {
        if (!destroyed) setError(unsupportedMessage);
      });

    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [isHls, src, unsupportedMessage]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !trackProgress) return;

    const onPlaying = () => queueStart();
    const onPause = () => {
      if (!video.ended) queueHeartbeat("paused");
    };
    const onEnded = () => queueHeartbeat("ended");
    const onWaiting = () => queueHeartbeat("waiting");
    const onSeeking = () => queueHeartbeat("seeking");
    const onSeeked = () => {
      if (!video.paused && !video.ended) queueStart();
    };
    const onRateChange = () => {
      if (!video.paused && !video.ended) {
        enqueue(async () => {
          await sendHeartbeat("paused", true);
          await startSession();
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        queueHeartbeat("hidden");
      } else if (!video.paused && !video.ended && !video.seeking) {
        queueStart();
      }
    };
    const onPageHide = () => {
      const tracking = sessionRef.current;
      if (!tracking) return;
      void requestTracking(
        "PATCH",
        {
          ...tracking,
          state: "hidden",
          activeWindow: true,
          positionSec: video.currentTime,
          playbackRate: video.playbackRate,
        },
        true
      ).catch(() => undefined);
      sessionRef.current = null;
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ratechange", onRateChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    const heartbeatTimer = window.setInterval(() => {
      if (
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        document.visibilityState === "visible"
      ) {
        queueHeartbeat("playing");
      }
    }, 15_000);

    return () => {
      window.clearInterval(heartbeatTimer);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ratechange", onRateChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enqueue, queueHeartbeat, queueStart, requestTracking, sendHeartbeat, startSession, trackProgress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const trackingText =
    locale === "zh-CN"
      ? trackingState === "teacher"
        ? "教师预览不计入学生回放时长"
        : trackingState === "recording"
          ? "有效观看计时中 · 每 15 秒安全保存"
          : trackingState === "error"
            ? "统计暂时中断，继续播放时会自动重试"
            : "播放后开始统计；暂停、拖动或切出页面时停止计时"
      : trackingState === "teacher"
        ? "Teacher preview is not counted as student watch time"
        : trackingState === "recording"
          ? "Counting verified watch time · saved every 15 seconds"
          : trackingState === "error"
            ? "Tracking paused; playback will retry automatically"
            : "Tracking starts on play and pauses when you seek, pause, or leave this tab";

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className={className}
        src={isHls ? undefined : src}
        controls
        playsInline
        preload="metadata"
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-black/75 px-4 py-3 text-sm text-white">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-white/10 bg-zinc-950 px-4 py-3 text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {trackingState === "recording" ? (
            <Activity className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : trackingState === "teacher" ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-sky-400" />
          ) : (
            <Clock3 className="h-4 w-4 shrink-0 text-zinc-500" />
          )}
          <span className="truncate">{trackingText}</span>
        </div>
        {trackProgress && (
          <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-zinc-400">
            <span>{locale === "zh-CN" ? "已记录" : "Recorded"}</span>
            <span className="rounded-md bg-white/10 px-2 py-1 font-semibold text-white">
              {formatDuration(watchedSec)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
