"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, Loader2, PlayCircle, User, Users } from "lucide-react";
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
  const { t } = useTranslation();
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
