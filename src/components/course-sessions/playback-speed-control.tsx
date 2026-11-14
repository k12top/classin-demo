"use client";

import { useEffect, type RefObject } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { playbackProgressPolicy } from "@/lib/playback-progress";

const speeds = [0.75, 1, 1.25, 1.5, 2];

/** Speed belongs to the replay view so replacing a clip does not reset it. */
export function usePlaybackSpeed({ videoRef, value, onChange }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  value: number;
  onChange: (speed: number) => void;
}) {
  const { locale } = useTranslation();
  const label = locale.startsWith("zh") ? "回放倍速" : locale.startsWith("vi") ? "Tốc độ phát lại" : "Playback speed";
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  // Native media menus can expose additional supported rates, such as 0.5×.
  const options = [...new Set([...speeds, value])].sort((a, b) => a - b);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      if (video.defaultPlaybackRate !== value) video.defaultPlaybackRate = value;
      if (video.playbackRate !== value) video.playbackRate = value;
    };
    apply();
    video.addEventListener("loadedmetadata", apply);
    return () => video.removeEventListener("loadedmetadata", apply);
  }, [videoRef, value]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      const rate = video.playbackRate;
      const supported = Number.isFinite(rate)
        ? Math.max(playbackProgressPolicy.minimumPlaybackRate, Math.min(playbackProgressPolicy.maximumPlaybackRate, rate))
        : 1;
      if (rate !== supported) video.playbackRate = supported;
      onChange(supported);
    };
    video.addEventListener("ratechange", sync);
    return () => video.removeEventListener("ratechange", sync);
  }, [videoRef, onChange]);

  return {label, format, options};
}

export function PlaybackSpeedControl(props: {videoRef: RefObject<HTMLVideoElement | null>;value:number;onChange:(speed:number)=>void}) {
  const {label,format,options}=usePlaybackSpeed(props);
  const {value,onChange}=props;
  return <select data-playback-speed aria-label={label} title={label} value={value}
    onChange={event => onChange(Number(event.target.value))}
    className="h-8 min-w-[68px] max-w-full rounded-md border border-white/30 bg-transparent px-2 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
    {options.map(speed => <option key={speed} value={speed} className="bg-background text-foreground">{format.format(speed)}×</option>)}
  </select>;
}
