"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Presentation, Video, VideoOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ClassroomMediaProvider, ClassroomMediaSnapshot, ClassroomParticipant } from "@/lib/classroom/types";

export function AuxiliaryCameraSettings({ provider, media, cameras, primaryDeviceId, allowed, onError }: {
  provider: ClassroomMediaProvider | null;
  media: ClassroomMediaSnapshot;
  cameras: MediaDeviceInfo[];
  primaryDeviceId: string;
  allowed: boolean;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [switching, setSwitching] = useState(false);
  const active = Boolean(media.local.auxiliaryCameraOn);
  const starting = Boolean(media.local.auxiliaryCameraStarting);
  const selectedId = media.local.auxiliaryCameraDeviceId || "";
  const selected = cameras.some((camera) => camera.deviceId === selectedId) ? selectedId : "";
  const ready = allowed && Boolean(provider) && Boolean(primaryDeviceId) && Boolean(selected) && selected !== primaryDeviceId && cameras.length >= 2;

  const act = async (operation: () => Promise<void>) => {
    onError("");
    try { await operation(); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      onError(/PERMISSION_DENIED|NotAllowedError|Permission denied/i.test(message)
        ? t("classroom.v3.cameraPermissionDenied")
        : message || t("classroom.v3.mediaActionFailed"));
    }
  };

  return (
    <fieldset className="classroom-v3-auxiliary-settings">
      <legend>{t("classroom.v3.auxiliaryCamera")}</legend>
      <p>{t("classroom.v3.auxiliaryCameraHint")}</p>
      <label>
        <span>{t("classroom.v3.auxiliaryCameraDevice")}</span>
        <select value={selected} disabled={!provider || !allowed || starting || switching}
          onChange={(event) => {
            const deviceId = event.target.value;
            setSwitching(true);
            void act(() => provider!.setAuxiliaryCameraDevice(deviceId)).finally(() => setSwitching(false));
          }}>
          <option value="" disabled>{t("classroom.v3.selectCamera")}</option>
          {cameras.map((camera, index) => (
            <option key={camera.deviceId} value={camera.deviceId} disabled={!camera.deviceId || camera.deviceId === primaryDeviceId}>
              {camera.label || `${t("classroom.v3.camera")} ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <div className="classroom-v3-auxiliary-settings-action">
        <button type="button" aria-pressed={active} aria-busy={starting || switching}
          disabled={!provider || switching || (!(active || starting) && !ready)}
          onClick={() => void act(() => active || starting ? provider!.stopAuxiliaryCamera() : provider!.startAuxiliaryCamera(selected))}>
          {starting || switching ? <Loader2 className="animate-spin" /> : active ? <VideoOff /> : <Video />}
          {starting ? t("classroom.v3.cancelAuxiliaryCamera") : active ? t("classroom.v3.stopAuxiliaryCamera") : t("classroom.v3.startAuxiliaryCamera")}
        </button>
        <span role="status">{active ? t("classroom.v3.auxiliaryCameraOn") : !allowed ? t("classroom.v3.auxiliaryCameraPermission") : cameras.length < 2 ? t("classroom.v3.auxiliaryCameraTwoDevices") : !primaryDeviceId ? t("classroom.v3.auxiliaryCameraSelectPrimary") : t("classroom.v3.auxiliaryCameraOff")}</span>
      </div>
    </fieldset>
  );
}

export type AuxiliaryCameraFeed = {
  participant: ClassroomParticipant;
  provider: ClassroomMediaProvider;
  displayName: string;
  ownerId: string;
  canPlace: boolean;
};

function AuxiliaryCameraFeedView({ feed, onPlace, recorder }: { feed: AuxiliaryCameraFeed; onPlace: (feed: AuxiliaryCameraFeed) => void; recorder: boolean }) {
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    feed.provider.attachVideo(feed.participant.id, element);
    return () => feed.provider.detachVideo(feed.participant.id, element);
  }, [feed.provider, feed.participant.id]);
  return (
    <section className="classroom-v3-auxiliary-feed" aria-label={feed.displayName}>
      <div ref={target} className="classroom-v3-auxiliary-video" />
      <header>
        <span>{feed.displayName}</span>
        {!recorder && feed.canPlace && <button type="button" onClick={() => onPlace(feed)} title={t("classroom.v3.auxiliaryCameraToBoard")} aria-label={t("classroom.v3.auxiliaryCameraToBoard")}><Presentation /></button>}
      </header>
    </section>
  );
}

export function AuxiliaryCameraFeeds({ feeds, onPlace, recorder }: { feeds: AuxiliaryCameraFeed[]; onPlace: (feed: AuxiliaryCameraFeed) => void; recorder: boolean }) {
  if (!feeds.length) return null;
  return <div className="classroom-v3-auxiliary-feeds">{feeds.map((feed) => <AuxiliaryCameraFeedView key={`${feed.participant.id}:${feed.canPlace}`} feed={feed} onPlace={onPlace} recorder={recorder} />)}</div>;
}
