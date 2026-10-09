"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import {
  Activity,
  Clock3,
  ShieldCheck,
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Loader2,
  PlayCircle,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { useAuth } from "@/lib/auth-context";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { useTranslation } from "@/lib/i18n/context";
import { isHlsPlaybackUrl, isMp4PlaybackUrl } from "@/lib/playback-url";
import { captionTranslation, type CaptionDisplayMode } from "@/lib/classroom/caption-display";
import { activeCaptionIndex, captionPosition } from "@/lib/classroom/playback-captions";
import type { CourseSessionSummaryDocument, SummaryEvidence } from "@/lib/course-session-summary-document";
import { LessonSummaryReport } from "@/components/course-sessions/lesson-summary-report";
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
  errorMessage?: string | null;
  failureStage?: string | null;
};

type LessonSummaryDocument = CourseSessionSummaryDocument;

type LessonSummary = {
  id: string;
  sessionId: string;
  status: "draft" | "published";
  document: LessonSummaryDocument;
  captionCount: number;
  sourceUpdatedAt: string | null;
  generatedAt: string;
  publishedAt: string | null;
  updatedAt: string;
  isStale: boolean;
};

type LessonCaption = {
  id: string;
  occurredAt: string;
  speakerName: string;
  text: string;
  translations: Record<string, string>;
};

type CaptionAppearance = {
  background: "solid" | "transparent";
  size: "small" | "medium" | "large";
  position: "top" | "bottom";
};

type PlaybackSeek = { recordingId: string; seconds: number; captionId: string };

type SummaryCopy = {
  title: string;
  draft: string;
  published: string;
  generate: string;
  regenerate: string;
  save: string;
  publish: string;
  unpublish: string;
  overview: string;
  keyPoints: string;
  questions: string;
  actionItems: string;
  speakers: string;
  noSummary: string;
  noCaptions: string;
  stale: string;
  edit: string;
  cancel: string;
  saving: string;
  generatedFrom: string;
};

export default function CoursePlaybackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { id } = use(params);
  const { embed } = use(searchParams);
  const embedded = embed === "1" || embed === "true";
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { locale, t } = useTranslation();
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
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [lessonCaptions, setLessonCaptions] = useState<LessonCaption[]>([]);
  const [nextCaptionCursor, setNextCaptionCursor] = useState<string | null>(null);
  const [captionsLoadingMore, setCaptionsLoadingMore] = useState(false);
  const summaryRequestIdRef = useRef(0);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryBusy, setSummaryBusy] = useState<
    "generate" | "save" | "publish" | "unpublish" | null
  >(null);
  const [summaryCanManage, setSummaryCanManage] = useState(false);
  const [captionMode, setCaptionMode] = useState<CaptionDisplayMode>("off");
  const [captionLanguage, setCaptionLanguage] = useState("");
  const [captionAppearance, setCaptionAppearance] = useState<CaptionAppearance>({ background: "solid", size: "medium", position: "bottom" });
  const [captionSettingsOpen, setCaptionSettingsOpen] = useState(false);
  const [captionPrefsLoaded, setCaptionPrefsLoaded] = useState(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState("");
  const [continuePlaybackId, setContinuePlaybackId] = useState("");
  const [mediaTime, setMediaTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<PlaybackSeek | null>(null);

  useEffect(() => {
    const savedMode = window.localStorage.getItem("playback_caption_mode");
    const savedLanguage = window.localStorage.getItem("playback_caption_language") || "";
    const savedBackground = window.localStorage.getItem("playback_caption_background");
    const savedSize = window.localStorage.getItem("playback_caption_size");
    const savedPosition = window.localStorage.getItem("playback_caption_position");
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (savedMode === "original" || savedMode === "translated" || savedMode === "bilingual") setCaptionMode(savedMode);
      setCaptionLanguage(savedLanguage);
      setCaptionAppearance({
        background: savedBackground === "transparent" ? "transparent" : "solid",
        size: savedSize === "small" || savedSize === "large" ? savedSize : "medium",
        position: savedPosition === "top" ? "top" : "bottom",
      });
      setCaptionPrefsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!captionPrefsLoaded) return;
    window.localStorage.setItem("playback_caption_mode", captionMode);
    window.localStorage.setItem("playback_caption_language", captionLanguage);
    window.localStorage.setItem("playback_caption_background", captionAppearance.background);
    window.localStorage.setItem("playback_caption_size", captionAppearance.size);
    window.localStorage.setItem("playback_caption_position", captionAppearance.position);
  }, [captionAppearance, captionLanguage, captionMode, captionPrefsLoaded]);

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

  const summaryCopy = useMemo<SummaryCopy>(() => (
    locale.startsWith("zh")
      ? {
          title: "课后总结",
          draft: "待教师审核",
          published: "已发布给学生",
          generate: "生成课后总结",
          regenerate: "重新生成",
          save: "保存草稿",
          publish: "发布给学生",
          unpublish: "撤回发布",
          overview: "课程概述",
          keyPoints: "重点内容",
          questions: "课堂问题",
          actionItems: "课后行动项",
          speakers: "发言记录",
          noSummary: "课后总结将在教师审核后发布。",
          noCaptions: "还没有可用于生成总结的最终字幕。",
          stale: "字幕有更新，建议重新生成后再发布。",
          edit: "编辑",
          cancel: "取消",
          saving: "正在保存…",
          generatedFrom: "基于 {count} 条最终字幕生成",
        }
      : {
          title: "Lesson summary",
          draft: "Awaiting teacher review",
          published: "Published to students",
          generate: "Generate lesson summary",
          regenerate: "Regenerate",
          save: "Save draft",
          publish: "Publish to students",
          unpublish: "Unpublish",
          overview: "Overview",
          keyPoints: "Key points",
          questions: "Questions raised",
          actionItems: "Follow-up actions",
          speakers: "Speaker record",
          noSummary: "The lesson summary will appear after the teacher reviews it.",
          noCaptions: "There are no final captions available for a summary yet.",
          stale: "New captions are available. Regenerate before publishing.",
          edit: "Edit",
          cancel: "Cancel",
          saving: "Saving…",
          generatedFrom: "Generated from {count} final captions",
        }
  ), [locale]);

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
      const requestedSession = nextSessions.find((session) => session.id === requestedId);
      const fallbackSession = nextSessions.find(
        (session) => (session._count?.recordings || 0) > 0,
      ) || nextSessions.find((session) => session.status === "finished");
      setSelectedSessionId(
        requestedSession?.id || fallbackSession?.id || "",
      );
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
          refreshAfterMs?: number | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || copy.loadFailed);
        if (!controller.signal.aborted) {
          setRecordings(payload.recordings || []);
          if (payload.refreshAfterMs) {
            window.setTimeout(() => {
              if (!controller.signal.aborted) {
                setRecordingsRevision((value) => value + 1);
              }
            }, payload.refreshAfterMs);
          }
        }
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

  const fetchSummary = useCallback(async () => {
    const requestId = ++summaryRequestIdRef.current;
    setCaptionsLoadingMore(false);
    if (!selectedSessionId) {
      setSummary(null);
      setLessonCaptions([]);
      setNextCaptionCursor(null);
      setSummaryCanManage(false);
      return;
    }
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(selectedSessionId)}/summary`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        summary?: LessonSummary | null;
        captions?: LessonCaption[];
        nextCaptionCursor?: string | null;
        canManage?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || copy.loadFailed);
      if (requestId !== summaryRequestIdRef.current) return;
      setSummary(payload.summary || null);
      setLessonCaptions(Array.isArray(payload.captions) ? payload.captions : []);
      setNextCaptionCursor(payload.nextCaptionCursor || null);
      setSummaryCanManage(Boolean(payload.canManage));
      setSummaryLoading(false);
      let cursor = payload.nextCaptionCursor || null;
      let loaded = payload.captions?.length || 0;
      if (cursor) setCaptionsLoadingMore(true);
      while (cursor && loaded < 2_000 && requestId === summaryRequestIdRef.current) {
        let page: { captions?: LessonCaption[]; nextCaptionCursor?: string | null };
        try {
          const next = await fetch(
            `/api/sessions/${encodeURIComponent(selectedSessionId)}/summary?captionCursor=${encodeURIComponent(cursor)}`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (!next.ok) break;
          page = await next.json();
        } catch { break; }
        if (requestId !== summaryRequestIdRef.current) break;
        const more = Array.isArray(page.captions) ? page.captions : [];
        if (!more.length || page.nextCaptionCursor === cursor) break;
        setLessonCaptions((current) => [...current, ...more]);
        loaded += more.length;
        cursor = page.nextCaptionCursor || null;
        setNextCaptionCursor(cursor);
      }
      if (requestId === summaryRequestIdRef.current) setCaptionsLoadingMore(false);
    } catch (cause) {
      if (requestId !== summaryRequestIdRef.current) return;
      setSummaryError(cause instanceof Error ? cause.message : copy.loadFailed);
    } finally {
      if (requestId === summaryRequestIdRef.current) setSummaryLoading(false);
    }
  }, [copy.loadFailed, selectedSessionId]);

  const loadMoreCaptions = useCallback(async () => {
    if (!selectedSessionId || !nextCaptionCursor || captionsLoadingMore) return;
    const requestId = summaryRequestIdRef.current;
    setCaptionsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(selectedSessionId)}/summary?captionCursor=${encodeURIComponent(nextCaptionCursor)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json() as {
        captions?: LessonCaption[];
        nextCaptionCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || copy.loadFailed);
      if (requestId !== summaryRequestIdRef.current) return;
      setLessonCaptions((current) => [...current, ...(payload.captions || [])]);
      setNextCaptionCursor(payload.nextCaptionCursor || null);
    } catch (cause) {
      if (requestId !== summaryRequestIdRef.current) return;
      setSummaryError(cause instanceof Error ? cause.message : copy.loadFailed);
    } finally {
      if (requestId === summaryRequestIdRef.current) setCaptionsLoadingMore(false);
    }
  }, [captionsLoadingMore, copy.loadFailed, nextCaptionCursor, selectedSessionId]);

  useEffect(() => {
    queueMicrotask(() => void fetchSummary());
  }, [fetchSummary]);

  const updateSummary = useCallback(async (
    action: "generate" | "save" | "publish" | "unpublish",
    document?: LessonSummaryDocument,
  ) => {
    if (!selectedSessionId) return false;
    setSummaryBusy(action);
    setSummaryError("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(selectedSessionId)}/summary`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...(document && { document }) }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        summary?: LessonSummary;
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || copy.loadFailed);
      }
      setSummary(payload.summary);
      return true;
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : copy.loadFailed);
      return false;
    } finally {
      setSummaryBusy(null);
    }
  }, [copy.loadFailed, selectedSessionId]);

  const recordUrl = course?.recordUrl?.trim() || "";
  const canPlayMp4 = course?.status === "finished" && isMp4PlaybackUrl(recordUrl);
  const canPlayHls = course?.status === "finished" && isHlsPlaybackUrl(recordUrl);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const playableRecordings = recordings.filter(
    (recording) => recording.status === "completed" && Boolean(recording.playbackUrl),
  );
  const canPlaySessionRecording = playableRecordings.length > 0;
  const recordingIsProcessing = recordings.some((recording) =>
    ["starting", "recording", "stopping", "processing"].includes(
      recording.status,
    ),
  );
  const failedRecording = recordings.find(
    (recording) => recording.status === "failed",
  );
  const canPlayInApp = canPlaySessionRecording || canPlayMp4 || canPlayHls;
  const hasRecordedSession = sessions.some(
    (session) => (session._count?.recordings || 0) > 0,
  );
  const isTeacher = Boolean(course?.canTeach);
  const reviewableSessions = sessions.filter(
    (session) =>
      (session._count?.recordings || 0) > 0 ||
      session.status === "finished" ||
      session.status === "afterClass",
  );
  const selectedRecording = playableRecordings.find((recording) => recording.id === selectedRecordingId)
    || playableRecordings[0] || null;
  const captionCanSync = Boolean(selectedRecording?.startedAt && selectedRecording?.stoppedAt && lessonCaptions.length);
  const activeCaption = lessonCaptions[activeCaptionIndex(lessonCaptions, selectedRecording, mediaTime)] || null;
  const captionLanguages = Array.from(new Set(
    lessonCaptions.flatMap((caption) => Object.keys(caption.translations || {})),
  ));
  const effectiveCaptionLanguage = captionLanguages.includes(captionLanguage)
    ? captionLanguage : captionLanguages[0] || "";
  const selectedCaptionTranslation = activeCaption && effectiveCaptionLanguage
    ? captionTranslation(activeCaption, effectiveCaptionLanguage) : "";
  const activeCaptionPosition = activeCaption && captionPosition(activeCaption.occurredAt, playableRecordings);
  const videoCaption = activeCaptionPosition && selectedRecording && activeCaptionPosition.recordingId === selectedRecording.id &&
    mediaTime - activeCaptionPosition.seconds >= -0.5 && mediaTime - activeCaptionPosition.seconds <= 12
    ? activeCaption : null;
  const captionPositionFor = (caption: LessonCaption) => captionPosition(caption.occurredAt, playableRecordings);
  const selectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSelectedRecordingId("");
    setContinuePlaybackId("");
    setMediaTime(0);
    setSeekRequest(null);
    const url = new URL(window.location.href);
    url.searchParams.set("sessionId", sessionId);
    window.history.replaceState(null, "", url);
  };
  const seekToCaption = (caption: LessonCaption) => {
    const position = captionPositionFor(caption);
    if (!position) return;
    setSelectedRecordingId(position.recordingId);
    setContinuePlaybackId("");
    setSeekRequest({ ...position, captionId: caption.id });
  };
  const playNextRecording = () => {
    const index = playableRecordings.findIndex((recording) => recording.id === selectedRecording?.id);
    const next = playableRecordings[index + 1];
    if (!next) return;
    setMediaTime(0);
    setSeekRequest(null);
    setContinuePlaybackId(next.id);
    setSelectedRecordingId(next.id);
  };

  if (authLoading || loading || sessionsLoading) {
    return <PageLoadingState message={copy.loading} variant="course" />;
  }

  const message =
    error ||
    (!selectedSessionId && course?.status !== "finished"
      ? copy.notFinished
      : !canPlayInApp
        ? recordingIsProcessing
          ? locale.startsWith("zh")
            ? "课堂回放正在生成，页面会自动刷新。"
            : "The lesson recording is being prepared. This page will refresh automatically."
          : failedRecording
            ? failedRecording.errorMessage ||
              (locale.startsWith("zh")
                ? "课堂录像生成失败，请检查录像配置后重试。"
                : "The lesson recording failed. Check the recording configuration and retry.")
            : copy.noUrl
        : "");

  const lessonContentProps = {
    summary,
    captions: lessonCaptions,
    hasMoreCaptions: Boolean(nextCaptionCursor),
    captionsLoadingMore,
    onLoadMoreCaptions: () => void loadMoreCaptions(),
    recordings: playableRecordings,
    activeCaptionId: activeCaption?.id || null,
    onSeekToCaption: seekToCaption,
    loading: summaryLoading,
    error: summaryError,
    canManage: summaryCanManage,
    busy: summaryBusy,
    copy: summaryCopy,
    onGenerate: () => void updateSummary("generate"),
    onSave: (document: LessonSummaryDocument) => updateSummary("save", document),
    onPublish: () => void updateSummary("publish"),
    onUnpublish: () => void updateSummary("unpublish"),
  };

  return (
    <PortalShell
      embedded={embedded}
      role={isTeacher ? "teacher" : "student"}
      user={user!}
      activePage="courses"
      onPageChange={(page: PortalPage) =>
        router.push(`/?view=${encodeURIComponent(page)}`)
      }
      onLogout={logout}
    >
      <main className="mx-auto max-w-[1540px]">
        {!embedded && <Button
          variant="ghost"
          size="sm"
          className="mb-4 rounded-xl text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/courses/${id}`)}
        >
          <ChevronLeft className="h-4 w-4" />
          {copy.back}
        </Button>}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Lesson replay</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{course?.name || copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{locale.startsWith("zh") ? "从视频、发言到课后要点，在同一处回顾这堂课。" : "Review the video, conversation and lesson notes together."}</p>
          </div>
          {course?.teacherName && <Badge variant="outline">{copy.teacher}: {course.teacherName}</Badge>}
        </div>
        <div className={`grid items-start gap-4 ${reviewableSessions.length > 1 ? "xl:grid-cols-[210px_minmax(0,1fr)_350px]" : "xl:grid-cols-[minmax(0,1fr)_370px]"}`}>
        {reviewableSessions.length > 1 && (
          <nav aria-label={locale.startsWith("zh") ? "课次回放" : "Lesson replays"} className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm xl:block">
            <div className="border-b border-border/60 px-4 py-4">
              <h2 className="text-sm font-semibold">{locale.startsWith("zh") ? "课次回放" : "Lesson replays"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{reviewableSessions.length} {locale.startsWith("zh") ? "堂课" : "lessons"}</p>
            </div>
            {reviewableSessions.map((session, index) => (
              <button key={session.id} type="button" aria-current={session.id === selectedSessionId ? "page" : undefined}
                onClick={() => selectSession(session.id)}
                className={`block w-full border-b border-border/50 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary ${session.id === selectedSessionId ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""}`}>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Lesson {String(index + 1).padStart(2, "0")}</span>
                <strong className="mt-1 block text-sm leading-5">{session.title || copy.title}</strong>
                <small className="mt-2 block text-xs text-muted-foreground">{new Date(session.startTime).toLocaleDateString(locale)}</small>
              </button>
            ))}
          </nav>
        )}
        <div className="min-w-0">
        {reviewableSessions.length > 1 && (
          <label className="mb-3 block xl:hidden">
            <span className="sr-only">{locale.startsWith("zh") ? "选择课次" : "Select lesson"}</span>
            <select className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm" value={selectedSessionId} onChange={(event) => selectSession(event.target.value)}>
              {reviewableSessions.map((session) => <option key={session.id} value={session.id}>{session.title || copy.title}</option>)}
            </select>
          </label>
        )}
        {selectedSession && <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{selectedSession.title || copy.title}</h2>
          <div className="flex items-center gap-3">
            <time dateTime={selectedSession.startTime} className="text-xs text-muted-foreground">{new Date(selectedSession.startTime).toLocaleString(locale)}</time>
            <a href="#lesson-summary" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-primary">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />{summaryCopy.title}
            </a>
          </div>
        </div>}
        <Card className="overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-[0_24px_70px_rgba(21,23,28,0.08)]">
          <CardContent className="p-0">
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
            ) : canPlayInApp ? (
              <>
                <PlaybackVideo
                  courseId={id}
                  trackProgress={!isTeacher}
                  locale={locale}
                  key={`${selectedSessionId}:${selectedRecording?.id || recordUrl}`}
                  src={selectedRecording?.playbackUrl || recordUrl}
                  isHls={selectedRecording ? selectedRecording.playbackFormat === "hls" : canPlayHls}
                  unsupportedMessage={copy.hlsUnsupported}
                  seekRequest={seekRequest}
                  onSeekComplete={() => setSeekRequest(null)}
                  onTimeUpdate={setMediaTime}
                  onEnded={playNextRecording}
                  autoStart={continuePlaybackId === selectedRecording?.id}
                  caption={videoCaption}
                  translation={videoCaption ? selectedCaptionTranslation : ""}
                  captionMode={captionMode}
                  captionAppearance={captionAppearance}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#141a27] px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!captionCanSync} aria-pressed={captionCanSync && captionMode !== "off"} aria-label={locale.startsWith("zh") ? "切换视频字幕" : "Toggle video captions"}
                      onClick={() => setCaptionMode((mode) => mode === "off" ? "bilingual" : "off")}
                      className={`rounded-md border px-2.5 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${!captionCanSync || captionMode === "off" ? "border-white/30 text-white/70" : "border-primary bg-primary text-primary-foreground"}`}>CC</button>
                    <button type="button" aria-expanded={captionSettingsOpen} aria-controls="playback-caption-settings"
                      aria-label={locale.startsWith("zh") ? "字幕设置" : "Caption settings"}
                      onClick={() => setCaptionSettingsOpen((open) => !open)}
                      className="rounded-md border border-white/30 p-1.5 text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Settings2 className="h-4 w-4" /></button>
                    <span className="text-xs text-white/60">{!selectedRecording?.startedAt || !selectedRecording?.stoppedAt ? (locale.startsWith("zh") ? "当前录像缺少字幕时间信息" : "Caption timing unavailable") : !lessonCaptions.length ? (locale.startsWith("zh") ? "暂无最终字幕" : "No final captions") : captionMode === "off" ? (locale.startsWith("zh") ? "视频字幕已关闭" : "Video captions off") : captionMode === "bilingual" ? (locale.startsWith("zh") ? "双语" : "Bilingual") : captionMode === "original" ? (locale.startsWith("zh") ? "原文" : "Original") : (locale.startsWith("zh") ? "译文" : "Translation")}</span>
                  </div>
                  <span className="text-xs text-white/50">{locale.startsWith("zh") ? "点击时间线发言可定位视频" : "Select an utterance to seek the video"}</span>
                </div>
                {captionSettingsOpen && (
                  <CaptionSettings mode={captionMode} onModeChange={setCaptionMode}
                    language={effectiveCaptionLanguage} languages={captionLanguages} onLanguageChange={setCaptionLanguage}
                    appearance={captionAppearance} onAppearanceChange={setCaptionAppearance} chinese={locale.startsWith("zh")} />
                )}
                {playableRecordings.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto border-t border-border/60 bg-card px-4 py-3">
                    {playableRecordings.map((recording) => <Button key={recording.id} type="button" size="sm"
                      variant={recording.id === selectedRecording?.id ? "default" : "outline"}
                      onClick={() => { setSelectedRecordingId(recording.id); setContinuePlaybackId(""); setSeekRequest(null); setMediaTime(0); }}>
                      {locale.startsWith("zh") ? `片段 ${recording.segment}` : `Segment ${recording.segment}`}
                    </Button>)}
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="rounded-full bg-amber-500/10 p-4 text-amber-500">
                  {recordingIsProcessing ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : message ? (
                    <AlertTriangle className="h-8 w-8" />
                  ) : (
                    <PlayCircle className="h-8 w-8" />
                  )}
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
        </div>
        {selectedSessionId && (
          <aside className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm" aria-label={locale.startsWith("zh") ? "课次内容" : "Lesson content"}>
            <LessonSummaryPanel presentation="timeline" {...lessonContentProps} />
          </aside>
        )}
        {selectedSessionId && (
          <section id="lesson-summary" className={`min-w-0 scroll-mt-6 ${reviewableSessions.length > 1 ? "xl:col-start-2 xl:col-span-2" : "xl:col-span-2"}`} aria-label={summaryCopy.title}>
            <LessonSummaryPanel presentation="summary" {...lessonContentProps} />
          </section>
        )}
        </div>
      </main>
    </PortalShell>
  );
}

function LessonSummaryPanel({
  presentation,
  summary,
  captions,
  hasMoreCaptions,
  captionsLoadingMore,
  onLoadMoreCaptions,
  recordings,
  activeCaptionId,
  onSeekToCaption,
  loading,
  error,
  canManage,
  busy,
  copy,
  onGenerate,
  onSave,
  onPublish,
  onUnpublish,
}: {
  presentation: "timeline" | "summary";
  summary: LessonSummary | null;
  captions: LessonCaption[];
  hasMoreCaptions: boolean;
  captionsLoadingMore: boolean;
  onLoadMoreCaptions: () => void;
  recordings: PlaybackRecording[];
  activeCaptionId: string | null;
  onSeekToCaption: (caption: LessonCaption) => void;
  loading: boolean;
  error: string;
  canManage: boolean;
  busy: "generate" | "save" | "publish" | "unpublish" | null;
  copy: SummaryCopy;
  onGenerate: () => void;
  onSave: (document: LessonSummaryDocument) => Promise<boolean>;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  return (
    <div>
    {presentation === "summary" && <Card className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-5 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{copy.title === "课后总结" ? "课后回顾" : "After the lesson"}</p>
              <h2 className="mt-0.5 text-lg font-semibold text-foreground">{copy.title}</h2>
              {summary ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {copy.generatedFrom.replace("{count}", String(summary.captionCount))}
                </p>
              ) : null}
            </div>
          </div>
          {summary ? (
            <Badge
              variant="outline"
              className={summary.status === "published"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"}
            >
              {summary.status === "published" ? <Check className="mr-1 h-3 w-3" /> : null}
              {summary.status === "published" ? copy.published : copy.draft}
            </Badge>
          ) : null}
        </div>

        {loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.saving}
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-sm text-destructive" role="alert">{error}</div>
        ) : !summary ? (
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              {canManage
                ? captions.length
                  ? copy.title === "课后总结"
                    ? "已有最终字幕，可生成课后总结。"
                    : "Final captions are ready for the lesson summary."
                  : copy.noCaptions
                : copy.noSummary}
            </p>
            {canManage ? (
              <Button type="button" size="sm" onClick={onGenerate} disabled={Boolean(busy)}>
                {busy === "generate" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {copy.generate}
              </Button>
            ) : null}
          </div>
        ) : (
          <SummaryDocument
            key={summary.updatedAt}
            summary={summary}
            canManage={canManage}
            busy={busy}
            copy={copy}
            onGenerate={onGenerate}
            onSave={onSave}
            onPublish={onPublish}
            onUnpublish={onUnpublish}
            evidenceLink={(evidence) => {
              if (!evidence.occurredAt) return null;
              const position = captionPosition(evidence.occurredAt, recordings);
              if (!position) return null;
              const segment = recordings.find((recording) => recording.id === position.recordingId)?.segment;
              return {
                label: `${recordings.length > 1 ? `${copy.title === "课后总结" ? "片段" : "Segment"} ${segment || 1} · ` : ""}${formatPlaybackTime(position.seconds)}`,
                seek: () => onSeekToCaption({ id: evidence.captionIds[0] || "summary-evidence", occurredAt: evidence.occurredAt!, speakerName: "", text: "", translations: {} }),
              };
            }}
          />
        )}
      </CardContent>
    </Card>}
    {presentation === "timeline" && (
      <>
      <div className="border-b border-border/60 px-5 py-5">
        <h2 className="text-base font-semibold text-foreground">{copy.title === "课后总结" ? "发言时间线" : "Utterance timeline"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{copy.title === "课后总结" ? "点击发言跳转到视频中的对应位置" : "Select an utterance to jump to the video"}</p>
      </div>
      <Card className="overflow-hidden rounded-none border-0 bg-card shadow-none">
        <CardContent className="p-3">
          {error && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {loading && !captions.length && <p className="p-3 text-sm text-muted-foreground">{copy.saving}</p>}
          {captions.length ? (
            <>
            <ol className="max-h-[650px] space-y-2 overflow-y-auto">
              {captions.map((caption) => {
                const position = captionPosition(caption.occurredAt, recordings);
                const segment = position && recordings.find((recording) => recording.id === position.recordingId)?.segment;
                const timeLabel = position
                  ? `${recordings.length > 1 ? `${copy.title === "课后总结" ? "片段" : "Segment"} ${segment || 1} · ` : ""}${formatPlaybackTime(position.seconds)}`
                  : "—";
                return <li key={caption.id}>
                  <button type="button" disabled={!position} onClick={() => onSeekToCaption(caption)}
                    aria-current={caption.id === activeCaptionId ? "true" : undefined}
                    title={!position ? (copy.title === "课后总结" ? "这条字幕缺少可定位的录像时间" : "No matching recording time for this caption") : undefined}
                    className={`grid w-full gap-1 rounded-xl border-l-2 p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${caption.id === activeCaptionId ? "border-primary bg-primary/10" : "border-primary/30 hover:bg-muted/50"} ${!position ? "cursor-not-allowed opacity-60" : ""}`}>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={caption.occurredAt}>{timeLabel}</time>
                      <span>{caption.speakerName}</span>
                    </span>
                    <span className="text-foreground">{caption.text}</span>
                    {Object.entries(caption.translations || {}).map(([language, translation]) => (
                      <span key={language} className="text-muted-foreground">{language}: {translation}</span>
                    ))}
                  </button>
                </li>;
              })}
            </ol>
            {hasMoreCaptions && (
              <Button type="button" size="sm" variant="outline" className="mt-4" disabled={captionsLoadingMore} onClick={onLoadMoreCaptions}>
                {captionsLoadingMore ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {copy.title === "课后总结" ? "加载更多字幕" : "Load more captions"}
              </Button>
            )}
            </>
          ) : !loading ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {copy.title === "课后总结" ? "本课次暂无已保存的最终字幕。" : "No final captions have been saved for this lesson."}
            </p>
          ) : null}
        </CardContent>
      </Card>
      </>
    )}
    </div>
  );
}

function SummaryDocument({
  summary,
  canManage,
  busy,
  copy,
  onGenerate,
  onSave,
  onPublish,
  onUnpublish,
  evidenceLink,
}: {
  summary: LessonSummary;
  canManage: boolean;
  busy: "generate" | "save" | "publish" | "unpublish" | null;
  copy: SummaryCopy;
  onGenerate: () => void;
  onSave: (document: LessonSummaryDocument) => Promise<boolean>;
  onPublish: () => void;
  onUnpublish: () => void;
  evidenceLink: (evidence: SummaryEvidence) => { label: string; seek: () => void } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LessonSummaryDocument>(summary.document);
  const disabled = Boolean(busy);
  const zh = copy.title === "课后总结";
  const generation = summary.document.generation;
  const updateList = (
    key: "keyPoints" | "questions" | "actionItems",
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value.split("\n").map((item) => item.trim()).filter(Boolean),
    }));
  };

  const save = async () => {
    if (await onSave(draft)) setEditing(false);
  };

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      {generation?.method === "transcript-extract" && (
        <p role="status" className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {zh ? generation.reason === "unavailable" ? "AI 总结暂时不可用，当前显示字幕摘录，可重新生成。" : "AI 总结未启用，当前显示字幕摘录。" : generation.reason === "unavailable" ? "AI summary is unavailable. Showing transcript extracts; you can regenerate." : "AI summary is disabled. Showing transcript extracts."}
        </p>
      )}
      {generation?.method === "meeting-multi-agent" && (
        <p className="mb-4 text-xs text-muted-foreground">
          {zh ? "AI 课堂纪要 · 分项分析后汇总" : "AI lesson report · specialist analyses and synthesis"}
          {generation.analyzedCaptionCount < generation.totalCaptionCount && <span className="ml-2 text-amber-800 dark:text-amber-200">{zh ? `仅分析最后 ${generation.analyzedCaptionCount} / ${generation.totalCaptionCount} 条字幕` : `Analyzed the last ${generation.analyzedCaptionCount} of ${generation.totalCaptionCount} captions`}</span>}
        </p>
      )}
      {summary.isStale && (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {copy.stale}
        </p>
      )}
      {canManage && (
        <div className="mb-5 flex flex-wrap justify-end gap-2">
          {editing ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => { setDraft(summary.document); setEditing(false); }} disabled={disabled}>
                {copy.cancel}
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} disabled={disabled}>
                {busy === "save" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {busy === "save" ? copy.saving : copy.save}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" onClick={onGenerate} disabled={disabled}>
                {busy === "generate" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {copy.regenerate}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} disabled={disabled}>
                {copy.edit}
              </Button>
              {summary.status === "published" ? (
                <Button type="button" size="sm" variant="outline" onClick={onUnpublish} disabled={disabled}>
                  {busy === "unpublish" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {copy.unpublish}
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={onPublish} disabled={disabled}>
                  {busy === "publish" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  {copy.publish}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {editing ? (
        <div className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{copy.title}</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <SummaryTextarea label={copy.overview} value={draft.overview} onChange={(value) => setDraft((current) => ({ ...current, overview: value }))} />
          <SummaryTextarea label={copy.keyPoints} value={draft.keyPoints.join("\n")} onChange={(value) => updateList("keyPoints", value)} />
          <SummaryTextarea label={copy.questions} value={draft.questions.join("\n")} onChange={(value) => updateList("questions", value)} />
          {draft.report ? <LessonSummaryReport report={draft.report} locale={zh ? "zh-CN" : "en"} onChange={(report) => setDraft((current) => ({ ...current, report, actionItems: report.actionItems.map((item) => item.title) }))} /> : <SummaryTextarea label={copy.actionItems} value={draft.actionItems.join("\n")} onChange={(value) => updateList("actionItems", value)} />}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 max-w-[72ch] space-y-6">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.015em] text-foreground">{summary.document.title}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{summary.document.overview}</p>
            </div>
            <SummaryList title={copy.keyPoints} items={summary.document.keyPoints} />
            <SummaryList title={copy.questions} items={summary.document.questions} />
            {summary.document.report ? <LessonSummaryReport report={summary.document.report} locale={zh ? "zh-CN" : "en"} evidenceLink={evidenceLink} /> : <SummaryList title={copy.actionItems} items={summary.document.actionItems} />}
          </div>
          <aside className="self-start rounded-xl bg-muted/45 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-primary" />
              {copy.speakers}
            </div>
            {summary.document.speakers.length ? (
              <ul className="mt-3 space-y-3">
                {summary.document.speakers.map((speaker) => (
                  <li key={speaker.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{speaker.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{speaker.utteranceCount}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted-foreground">—</p>}
          </aside>
        </div>
      )}
    </div>
  );
}

function SummaryTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={label.length > 6 ? 4 : 3}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => <li key={item} className="pl-4 before:mr-2 before:-ml-4 before:text-primary before:content-['•']">{item}</li>)}
      </ul>
    </section>
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

function PlaybackVideo({
  courseId,
  trackProgress,
  locale,
  src,
  isHls,
  unsupportedMessage,
  seekRequest,
  onSeekComplete,
  onTimeUpdate,
  onEnded,
  autoStart,
  caption,
  translation,
  captionMode,
  captionAppearance,
}: {
  courseId: string;
  trackProgress: boolean;
  locale: string;
  src: string;
  isHls: boolean;
  unsupportedMessage: string;
  seekRequest: PlaybackSeek | null;
  onSeekComplete: () => void;
  onTimeUpdate: (time: number) => void;
  onEnded: () => void;
  autoStart: boolean;
  caption: LessonCaption | null;
  translation: string;
  captionMode: CaptionDisplayMode;
  captionAppearance: CaptionAppearance;
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
    if (!video || !isHls) return;

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
  }, [isHls, src, unsupportedMessage]);

  useEffect(() => {
    if (!seekRequest) return;
    const video = videoRef.current;
    if (!video) return;
    const applySeek = () => {
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.1) : seekRequest.seconds;
      video.currentTime = Math.min(seekRequest.seconds, maxTime);
      onTimeUpdate(video.currentTime);
      onSeekComplete();
    };
    video.addEventListener("loadedmetadata", applySeek);
    applySeek();
    return () => video.removeEventListener("loadedmetadata", applySeek);
  }, [onSeekComplete, onTimeUpdate, seekRequest]);

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

  const showOriginal = captionMode === "original" || captionMode === "bilingual";
  const showTranslation = captionMode === "translated" || captionMode === "bilingual";
  const hasVisibleText = Boolean((showOriginal && caption?.text.trim()) || (showTranslation && translation.trim()));
  const captionSize = captionAppearance.size === "small" ? "text-xs sm:text-sm" : captionAppearance.size === "large" ? "text-base sm:text-lg" : "text-sm sm:text-base";

  return (
    <div className="relative bg-black">
      <video
        ref={videoRef}
        className="aspect-video w-full bg-black object-contain"
        src={isHls ? undefined : src}
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
        onSeeking={(event) => onTimeUpdate(event.currentTarget.currentTime)}
        onEnded={onEnded}
        onCanPlay={(event) => {
          if (autoStart) void event.currentTarget.play().catch(() => {});
        }}
      />
      {captionMode !== "off" && hasVisibleText && (
        <div className={`pointer-events-none absolute inset-x-4 flex justify-start ${captionAppearance.position === "top" ? "top-4" : "bottom-16"}`}>
          <div className={`max-w-[70%] rounded-xl px-4 py-2 text-center leading-relaxed text-white shadow-lg ${captionSize} ${captionAppearance.background === "transparent" ? "bg-transparent [text-shadow:0_2px_5px_rgba(0,0,0,0.95),0_0_2px_#000]" : "bg-[#202124]/90"}`}>
            {showOriginal && caption?.text.trim() && <p>{caption.text}</p>}
            {showTranslation && translation.trim() && <p className={showOriginal ? "mt-1 text-violet-100" : ""}>{translation}</p>}
          </div>
        </div>
      )}
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

function CaptionSettings({
  mode, onModeChange, language, languages, onLanguageChange, appearance, onAppearanceChange, chinese,
}: {
  mode: CaptionDisplayMode;
  onModeChange: (mode: CaptionDisplayMode) => void;
  language: string;
  languages: string[];
  onLanguageChange: (language: string) => void;
  appearance: CaptionAppearance;
  onAppearanceChange: (appearance: CaptionAppearance) => void;
  chinese: boolean;
}) {
  const modes: Array<[CaptionDisplayMode, string, string]> = [
    ["off", "关闭", "Off"], ["original", "只显示原文", "Original only"],
    ["translated", "只显示译文", "Translation only"], ["bilingual", "原文与译文", "Both languages"],
  ];
  return <div id="playback-caption-settings" className="grid gap-4 border-t border-border/60 bg-card p-4 sm:grid-cols-2">
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-foreground">{chinese ? "视频字幕显示" : "Video captions"}</legend>
      {modes.map(([value, zh, en]) => <label key={value} className="flex items-center gap-2 text-sm">
        <input type="radio" name="playback-caption-mode" value={value} checked={mode === value} onChange={() => onModeChange(value)} className="accent-primary" />
        {chinese ? zh : en}
      </label>)}
    </fieldset>
    <div className="grid gap-3 text-xs">
      <label className="grid gap-1"><span className="font-semibold">{chinese ? "翻译语言" : "Translation language"}</span>
        <select value={language} disabled={!languages.length} onChange={(event) => onLanguageChange(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
          {languages.length ? languages.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">{chinese ? "暂无译文" : "No translation available"}</option>}
        </select>
      </label>
      <label className="grid gap-1"><span className="font-semibold">{chinese ? "字幕背景" : "Caption background"}</span>
        <select value={appearance.background} onChange={(event) => onAppearanceChange({ ...appearance, background: event.target.value as CaptionAppearance["background"] })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="solid">{chinese ? "深色" : "Dark"}</option><option value="transparent">{chinese ? "透明" : "Transparent"}</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="font-semibold">{chinese ? "字号" : "Size"}</span>
          <select value={appearance.size} onChange={(event) => onAppearanceChange({ ...appearance, size: event.target.value as CaptionAppearance["size"] })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
            <option value="small">{chinese ? "小" : "Small"}</option><option value="medium">{chinese ? "标准" : "Medium"}</option><option value="large">{chinese ? "大" : "Large"}</option>
          </select>
        </label>
        <label className="grid gap-1"><span className="font-semibold">{chinese ? "位置" : "Position"}</span>
          <select value={appearance.position} onChange={(event) => onAppearanceChange({ ...appearance, position: event.target.value as CaptionAppearance["position"] })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
            <option value="bottom">{chinese ? "下方" : "Bottom"}</option><option value="top">{chinese ? "上方" : "Top"}</option>
          </select>
        </label>
      </div>
    </div>
  </div>;
}

function formatPlaybackTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
