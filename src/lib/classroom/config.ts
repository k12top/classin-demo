import type { ClassroomMediaProfile } from "@/lib/classroom/types";

/**
 * Provider-neutral classroom media defaults.
 *
 * Camera publishers send a high and low stream. Receivers subscribe to the
 * low stream by default and switch only the focused participant to high.
 */
export const classroomMediaProfile: ClassroomMediaProfile = {
  camera: {
    low: {
      width: 160,
      height: 120,
      frameRate: 15,
      bitrateKbps: 65,
    },
    high: {
      width: 1280,
      height: 720,
      frameRate: 15,
      bitrateKbps: 1200,
    },
  },
  screen: {
    width: 1920,
    height: 1080,
    frameRate: 15,
    bitrateKbps: 2500,
    optimizationMode: "detail",
  },
  recording: {
    width: 1280,
    height: 720,
    frameRate: 15,
    bitrateKbps: 1800,
  },
};

export const classroomRuntimeDefaults = {
  rtcTokenTtlSeconds: 6 * 60 * 60,
  recordingTokenTtlSeconds: 24 * 60 * 60,
  recordingMaxIdleSeconds: 5 * 60,
  screenShareUidSuffix: "::screen",
} as const;

