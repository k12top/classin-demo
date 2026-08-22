"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Loader2,
  PlayCircle,
  RefreshCw,
  Save,
  Send,
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

type LessonSummaryDocument = {
  version: 1;
  title: string;
  overview: string;
  keyPoints: string[];
  questions: string[];
  actionItems: string[];
  speakers: Array<{
    id: string;
    name: string;
    utteranceCount: number;
    characterCount: number;
  }>;
};

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
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
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryBusy, setSummaryBusy] = useState<
    "generate" | "save" | "publish" | "unpublish" | null
  >(null);
  const [summaryCanManage, setSummaryCanManage] = useState(false);

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

  const fetchSummary = useCallback(async () => {
    if (!selectedSessionId) {
      setSummary(null);
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
        canManage?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || copy.loadFailed);
      setSummary(payload.summary || null);
      setSummaryCanManage(Boolean(payload.canManage));
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : copy.loadFailed);
    } finally {
      setSummaryLoading(false);
    }
  }, [copy.loadFailed, selectedSessionId]);

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
  const canPlayInApp = canPlaySessionRecording || canPlayMp4 || canPlayHls;
  const hasRecordedSession = sessions.some(
    (session) => (session._count?.recordings || 0) > 0,
  );
  const hasReviewableSession = sessions.some(
    (session) =>
      (session._count?.recordings || 0) > 0 ||
      session.status === "finished" ||
      session.status === "afterClass",
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

            {hasReviewableSession && (
              <div className="flex gap-2 overflow-x-auto border-b border-border/60 px-5 py-3">
                {sessions
                  .filter(
                    (session) =>
                      (session._count?.recordings || 0) > 0 ||
                      session.status === "finished" ||
                      session.status === "afterClass",
                  )
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
        {selectedSessionId && (
          <LessonSummaryPanel
            summary={summary}
            loading={summaryLoading}
            error={summaryError}
            canManage={summaryCanManage}
            busy={summaryBusy}
            copy={summaryCopy}
            onGenerate={() => void updateSummary("generate")}
            onSave={(document) => updateSummary("save", document)}
            onPublish={() => void updateSummary("publish")}
            onUnpublish={() => void updateSummary("unpublish")}
          />
        )}
      </main>
    </PortalShell>
  );
}

function LessonSummaryPanel({
  summary,
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
  summary: LessonSummary | null;
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
    <Card className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
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
              {canManage ? copy.noCaptions : copy.noSummary}
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
          />
        )}
      </CardContent>
    </Card>
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
}: {
  summary: LessonSummary;
  canManage: boolean;
  busy: "generate" | "save" | "publish" | "unpublish" | null;
  copy: SummaryCopy;
  onGenerate: () => void;
  onSave: (document: LessonSummaryDocument) => Promise<boolean>;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LessonSummaryDocument>(summary.document);
  const disabled = Boolean(busy);
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
    <div className="px-5 py-5 sm:px-6 sm:py-6">
      {summary.isStale && (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {copy.stale}
        </p>
      )}
      {canManage && (
        <div className="mb-5 flex flex-wrap justify-end gap-2">
          {editing ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={disabled}>
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
          <SummaryTextarea label={copy.actionItems} value={draft.actionItems.join("\n")} onChange={(value) => updateList("actionItems", value)} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-6">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.015em] text-foreground">{summary.document.title}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{summary.document.overview}</p>
            </div>
            <SummaryList title={copy.keyPoints} items={summary.document.keyPoints} />
            <SummaryList title={copy.questions} items={summary.document.questions} />
            <SummaryList title={copy.actionItems} items={summary.document.actionItems} />
          </div>
          <aside className="rounded-xl bg-muted/45 p-4">
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
