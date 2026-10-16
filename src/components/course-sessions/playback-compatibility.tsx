"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { useTranslation } from "@/lib/i18n/context";
import { connectPlaybackMedia, type PlaybackIssue } from "@/lib/playback-media";

const fetchPlaybackSource: typeof fetch = async (input, init) => {
  let response = await fetch(input, init);
  if (response.status === 401 && !init?.signal?.aborted && await tryOAuthRefresh()) {
    response = await fetch(input, init);
  }
  return response;
};

export function usePlaybackMedia(videoRef: RefObject<HTMLVideoElement | null>, src: string, isHls: boolean) {
  const [issue, setIssue] = useState<PlaybackIssue | null>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const startAt = useRef(0);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return connectPlaybackMedia(video, src, isHls, {
      onIssue: setIssue, onDirectUrl: setDirectUrl, fetcher: fetchPlaybackSource,
      startAt: startAt.current,
    });
  }, [isHls, revision, src, videoRef]);
  const retry = useCallback(() => {
    const video = videoRef.current;
    // A failed reload has no metadata; retain the last valid position for the next retry.
    if (video && video.readyState >= 1) startAt.current = video.currentTime;
    setRevision((value) => value + 1);
  }, [videoRef]);
  return { issue, directUrl, retry };
}

export function PlaybackCompatibility({ issue, directUrl, src, isHls, sharePath, onRetry, onExternalPlay }: {
  issue: PlaybackIssue | null;
  directUrl: string | null;
  src: string;
  isHls: boolean;
  sharePath: string;
  onRetry: () => void;
  onExternalPlay: () => void;
}) {
  const { t } = useTranslation();
  const [wechat, setWechat] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [pageUrl, setPageUrl] = useState("");
  useEffect(() => {
    queueMicrotask(() => {
      const inWechat = /MicroMessenger/i.test(navigator.userAgent);
      setWechat(inWechat);
      if (inWechat) setHelpOpen(true);
    });
  }, []);
  useEffect(() => {
    if (issue) queueMicrotask(() => setHelpOpen(true));
  }, [issue]);
  const copyPage = async () => {
    // Copy the authenticated page, never an expiring OSS URL or embed tokens.
    const url = new URL(sharePath, window.location.origin).href;
    setPageUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  };

  return (
    <div className="border-t border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-200">
      {issue && <p role="alert" className="mb-3 leading-relaxed">{t(`playback.compatibility.${issue}`)}</p>}
      <details open={helpOpen} onToggle={(event) => setHelpOpen(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer rounded-sm py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          {t("playback.compatibility.title")}
        </summary>
        <p className="mt-2 max-w-prose leading-relaxed text-zinc-300">
          {t(wechat ? "playback.compatibility.wechatHint" : "playback.compatibility.browserHint")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11 border-zinc-600 bg-transparent text-white hover:bg-zinc-800 hover:text-white" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{t("playback.compatibility.retry")}
          </Button>
          {!isHls && <Button asChild variant="outline" className="min-h-11 border-zinc-600 bg-transparent text-white hover:bg-zinc-800 hover:text-white">
            <a href={directUrl || src} target="_blank" rel="noopener noreferrer" onClick={onExternalPlay}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />{t("playback.compatibility.openMp4")}
            </a>
          </Button>}
          <Button type="button" variant="outline" className="min-h-11 border-zinc-600 bg-transparent text-white hover:bg-zinc-800 hover:text-white" onClick={() => void copyPage()}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />{t("playback.compatibility.copyPage")}
          </Button>
        </div>
        {!isHls && <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t("playback.compatibility.externalHint")}</p>}
        <div role="status" className="mt-2 text-sm leading-relaxed text-zinc-300">
          {copyState === "copied" && t("playback.compatibility.copied")}
          {copyState === "manual" && <>
            <label className="block">{t("playback.compatibility.manualCopy")}
              <input readOnly value={pageUrl} onFocus={(event) => event.currentTarget.select()}
                className="mt-2 w-full min-w-0 rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-base text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" />
            </label>
          </>}
        </div>
      </details>
    </div>
  );
}
