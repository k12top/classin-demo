"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { useAuth } from "@/lib/auth-context";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { useTranslation } from "@/lib/i18n/context";
import { isHlsPlaybackUrl, isMp4PlaybackUrl } from "@/lib/playback-url";
import {
  PortalShell,
  type PortalPage,
} from "@/components/portal/portal-shell";

interface PlaybackCourse {
  id: string;
  name: string;
  teacherName: string;
  status: string;
  canTeach?: boolean;
  recordUrl?: string | null;
}

type PlaybackSession = {
  id: string;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  _count?: { recordings?: number };
};

type PlaybackRecording = {
  id: string;
  segment: number;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  playbackFormat: "hls" | "mp4" | null;
  playbackUrl: string | null;
};

export default function CoursePlaybackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { t } = useTranslation();
  const [course, setCourse] = useState<PlaybackCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<PlaybackSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [recordings, setRecordings] = useState<PlaybackRecording[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsError, setRecordingsError] = useState("");
  const [recordingsRevision, setRecordingsRevision] = useState(0);

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
      retry: t("playback.retry"),
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

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setRecordingsError("");
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(id)}/sessions`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sessions?: PlaybackSession[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || copy.loadFailed);
      const nextSessions = payload.sessions || [];
      setSessions(nextSessions);
      const requestedId = new URLSearchParams(window.location.search).get("sessionId") || "";
      const sessionWithRecording = nextSessions.find(
        (session) => session.id === requestedId && (session._count?.recordings || 0) > 0,
      );
      const fallbackSession = nextSessions.find(
        (session) => (session._count?.recordings || 0) > 0,
      );
      setSelectedSessionId(sessionWithRecording?.id || fallbackSession?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadFailed);
    } finally {
      setSessionsLoading(false);
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
      void fetchSessions();
    });
  }, [authLoading, fetchCourse, fetchSessions, user]);

  useEffect(() => {
    if (!selectedSessionId) {
      queueMicrotask(() => setRecordings([]));
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setRecordingsLoading(true);
        setRecordingsError("");
      }
    });
    void fetch(`/api/sessions/${encodeURIComponent(selectedSessionId)}/recordings`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          recordings?: PlaybackRecording[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || copy.loadFailed);
        if (!controller.signal.aborted) setRecordings(payload.recordings || []);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setRecordingsError(cause instanceof Error ? cause.message : copy.loadFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecordingsLoading(false);
      });
    return () => controller.abort();
  }, [copy.loadFailed, recordingsRevision, selectedSessionId]);

  const recordUrl = course?.recordUrl?.trim() || "";
  const canPlayMp4 = course?.status === "finished" && isMp4PlaybackUrl(recordUrl);
  const canPlayHls = course?.status === "finished" && isHlsPlaybackUrl(recordUrl);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const playableRecordings = recordings.filter(
    (recording) => recording.status === "completed" && Boolean(recording.playbackUrl),
  );
  const canPlaySessionRecording = playableRecordings.length > 0;
  const canPlayInApp = canPlaySessionRecording || canPlayMp4 || canPlayHls;
  const hasRecordedSession = sessions.some(
    (session) => (session._count?.recordings || 0) > 0,
  );
  const isTeacher = Boolean(course?.canTeach);

  if (authLoading || loading || sessionsLoading) {
    return <PageLoadingState message={copy.loading} variant="course" />;
  }

  const message =
    error ||
    (!selectedSessionId && course?.status !== "finished"
      ? copy.notFinished
      : !canPlayInApp
        ? copy.noUrl
        : "");

  return (
    <PortalShell
      role={isTeacher ? "teacher" : "student"}
      user={user!}
      activePage="courses"
      onPageChange={(page: PortalPage) =>
        router.push(`/?view=${encodeURIComponent(page)}`)
      }
      onLogout={logout}
    >
      <main className="mx-auto max-w-6xl">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 rounded-xl text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/courses/${id}`)}
        >
          <ChevronLeft className="h-4 w-4" />
          {copy.back}
        </Button>
        <Card className="overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-[0_24px_70px_rgba(21,23,28,0.08)]">
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

            {hasRecordedSession && (
              <div className="flex gap-2 overflow-x-auto border-b border-border/60 px-5 py-3">
                {sessions
                  .filter((session) => (session._count?.recordings || 0) > 0)
                  .map((session) => (
                    <Button
                      key={session.id}
                      type="button"
                      size="sm"
                      variant={session.id === selectedSessionId ? "default" : "outline"}
                      className="shrink-0 rounded-lg"
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                      {session.title || copy.title}
                    </Button>
                  ))}
              </div>
            )}

            {selectedSessionId && recordingsError ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center text-sm text-destructive" role="alert">
                <span>{recordingsError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setRecordingsRevision((value) => value + 1)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {copy.retry}
                </Button>
              </div>
            ) : recordingsLoading ? (
              <div className="flex min-h-[220px] items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                {copy.loading}
              </div>
            ) : canPlaySessionRecording ? (
              <SessionRecordingPlayer
                recordings={playableRecordings}
                hlsUnsupportedMessage={copy.hlsUnsupported}
              />
            ) : canPlayMp4 || canPlayHls ? (
              <div className="bg-black">
                {canPlayHls ? (
                  <HlsVideo
                    src={recordUrl}
                    className="aspect-video w-full bg-black"
                    unsupportedMessage={copy.hlsUnsupported}
                  />
                ) : (
                  <video
                    className="aspect-video w-full bg-black"
                    src={recordUrl}
                    controls
                    playsInline
                    preload="metadata"
                  />
                )}
              </div>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="rounded-full bg-amber-500/10 p-4 text-amber-500">
                  {message ? <AlertTriangle className="h-8 w-8" /> : <PlayCircle className="h-8 w-8" />}
                </div>
                <div className="max-w-md space-y-2">
                  <p className="text-base font-semibold text-foreground">
                    {message || copy.loadFailed}
                  </p>
                  {selectedSession && hasRecordedSession && (
                    <p className="text-sm text-muted-foreground">
                      {selectedSession.title || copy.title}
                    </p>
                  )}
                </div>
                {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </PortalShell>
  );
}

function SessionRecordingPlayer({
  recordings,
  hlsUnsupportedMessage,
}: {
  recordings: PlaybackRecording[];
  hlsUnsupportedMessage: string;
}) {
  const [selectedRecordingId, setSelectedRecordingId] = useState(recordings[0]?.id || "");
  const selectedRecording = recordings.find(
    (recording) => recording.id === selectedRecordingId,
  ) || recordings[0];

  if (!selectedRecording?.playbackUrl) return null;
  const isHls = selectedRecording.playbackFormat === "hls";

  return (
    <div className="bg-black">
      {isHls ? (
        <HlsVideo
          src={selectedRecording.playbackUrl}
          className="aspect-video w-full bg-black"
          unsupportedMessage={hlsUnsupportedMessage}
        />
      ) : (
        <video
          className="aspect-video w-full bg-black"
          src={selectedRecording.playbackUrl}
          controls
          playsInline
          preload="metadata"
        />
      )}
      {recordings.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/15 bg-black px-4 py-3">
          {recordings.map((recording) => (
            <Button
              key={recording.id}
              type="button"
              size="sm"
              variant={recording.id === selectedRecording.id ? "default" : "secondary"}
              className="shrink-0 rounded-lg"
              onClick={() => setSelectedRecordingId(recording.id)}
            >
              {recording.segment}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function HlsVideo({
  src,
  className,
  unsupportedMessage,
}: {
  src: string;
  className?: string;
  unsupportedMessage: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let hls: Hls | null = null;

    setError("");

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
  }, [src, unsupportedMessage]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className={className}
        controls
        playsInline
        preload="metadata"
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-black/75 px-4 py-3 text-sm text-white">
          {error}
        </div>
      )}
    </div>
  );
}
