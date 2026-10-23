"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CircleHelp, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export function PlaybackCompatibility({ issue, directUrl, src, isHls, sharePath, onRetry, onExternalPlay, onRecheck, recheckBusy }: {
  issue: PlaybackIssue | null;
  directUrl: string | null;
  src: string;
  isHls: boolean;
  sharePath: string;
  onRetry: () => void;
  onExternalPlay: () => void;
  onRecheck?: () => void;
  recheckBusy?: boolean;
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
    <div className="flex justify-end border-t border-border bg-card px-3 py-1.5">
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" className="min-h-11 gap-2 text-xs text-muted-foreground hover:text-foreground" aria-label={t("portalUpdates.playbackHelp")} title={t("portalUpdates.playbackHelp")}>
            <CircleHelp className="h-4 w-4" aria-hidden="true" />{t("portalUpdates.playbackHelp")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("portalUpdates.playbackHelp")}</DialogTitle></DialogHeader>
        {issue && <p role="alert" className="leading-relaxed text-destructive">{t(`playback.compatibility.${issue}`)}</p>}
        <DialogDescription className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t(wechat ? "playback.compatibility.wechatHint" : "playback.compatibility.browserHint")}
        </DialogDescription>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { onRetry(); setHelpOpen(false); }}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{t("playback.compatibility.retry")}
          </Button>
          {!isHls && <Button asChild variant="outline" className="min-h-11">
            <a href={directUrl || src} target="_blank" rel="noopener noreferrer" onClick={onExternalPlay}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />{t("playback.compatibility.openMp4")}
            </a>
          </Button>}
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void copyPage()}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />{t("playback.compatibility.copyPage")}
          </Button>
          {onRecheck && <Button type="button" variant="outline" className="min-h-11" disabled={recheckBusy} onClick={onRecheck}>
            {recheckBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
            {t("portalUpdates.recheckRecording")}
          </Button>}
        </div>
        {!isHls && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("playback.compatibility.externalHint")}</p>}
        <div role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {copyState === "copied" && t("playback.compatibility.copied")}
          {copyState === "manual" && <>
            <label className="block">{t("playback.compatibility.manualCopy")}
              <input readOnly value={pageUrl} onFocus={(event) => event.currentTarget.select()}
                className="mt-2 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
            </label>
          </>}
        </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
