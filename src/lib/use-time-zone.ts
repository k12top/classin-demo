"use client";
import { useSyncExternalStore } from "react";
import { deviceTimeZone, validTimeZone } from "./time-zone";

const eventName = "classroom-time-zone-change";
export const timeZoneStorageKey = "classroom_display_time_zone";
let transientPreference: string | null = null;
function snapshot() {
  let preference = transientPreference || "auto";
  if (transientPreference === null) {
    try { preference = localStorage.getItem(timeZoneStorageKey) || "auto"; } catch { /* Private browsers can deny storage. */ }
  }
  if (preference !== "auto" && !validTimeZone(preference)) preference = "auto";
  return `${preference}|${deviceTimeZone()}`;
}
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== null && event.key !== timeZoneStorageKey) return;
    transientPreference = null;
    callback();
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  const timer = window.setInterval(callback, 60_000);
  return () => {
    window.removeEventListener(eventName, callback); window.removeEventListener("storage", storageChanged); window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback); window.clearInterval(timer);
  };
}
export function useTimeZone() {
  const [preference, detected] = useSyncExternalStore(subscribe, snapshot, () => "auto|UTC").split("|");
  return {
    timeZone: preference === "auto" ? detected : preference,
    detectedTimeZone: detected, preference,
    setPreference: (value: string) => {
      if (value !== "auto" && !validTimeZone(value)) return;
      transientPreference = value;
      try { localStorage.setItem(timeZoneStorageKey, value); } catch { /* Keep this tab usable without storage. */ }
      window.dispatchEvent(new Event(eventName));
    },
  };
}
