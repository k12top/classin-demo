"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/page-loading-state";
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
  const { locale } = useTranslation();
  const [course, setCourse] = useState<PlaybackCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = useMemo(() => {
    const zh = locale === "zh-CN";
    return {
      loading: zh ? "正在加载回放..." : "Loading playback...",
      back: zh ? "返回课程" : "Back to course",
      title: zh ? "课程回放" : "Course playback",
      playableOnly: zh ? "当前回放链接不是 MP4 或 M3U8 视频，无法在此页播放。" : "This playback link is not an MP4 or M3U8 video and cannot be played here.",
      notFinished: zh ? "课程结束后才能观看回放。" : "Playback is available after the course has finished.",
      noUrl: zh ? "这节课还没有设置回放视频。" : "No playback video has been set for this course.",
      loadFailed: zh ? "回放加载失败。" : "Failed to load playback.",
      hlsUnsupported: zh ? "当前浏览器不支持 HLS/M3U8 播放，请更换浏览器。" : "This browser cannot play HLS/M3U8 here. Try another browser.",
      browserHint: zh ? "如果视频无法播放，请确认链接可公开访问且服务器支持浏览器播放。" : "If the video does not play, check that the link is accessible and browser playback is supported.",
      teacher: zh ? "授课老师" : "Teacher",
    };
  }, [locale]);

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
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/15">
            {copy.title}
          </Badge>
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
