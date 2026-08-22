import type { ClassroomMediaProfile } from "@/lib/classroom/types";

/**
 * Provider-neutral classroom media defaults.
 *
 * Camera publishers send a high and low stream. Receivers subscribe to the
 * low stream by default and switch only the focused participant to high.
 */
const thumbnail = {
  width: 160,
  height: 120,
  frameRate: 15,
  bitrateKbps: 65,
} as const;

export const classroomVideoPresets = {
  economy: {
    camera: {
      low: thumbnail,
      high: {
        width: 640,
        height: 360,
        frameRate: 15,
        bitrateKbps: 600,
      },
    },
    screen: {
      width: 1280,
      height: 720,
      frameRate: 15,
      bitrateKbps: 1500,
      optimizationMode: "detail",
    },
  },
  hd: {
    camera: {
      low: thumbnail,
      high: {
        width: 1280,
        height: 720,
        frameRate: 15,
        bitrateKbps: 1500,
      },
    },
    screen: {
      width: 1920,
      height: 1080,
      frameRate: 15,
      bitrateKbps: 2500,
      optimizationMode: "detail",
    },
  },
  fullHd: {
    camera: {
      low: thumbnail,
      high: {
        width: 1920,
        height: 1080,
        frameRate: 15,
        bitrateKbps: 2500,
      },
    },
    screen: {
      width: 1920,
      height: 1080,
      frameRate: 15,
      bitrateKbps: 3000,
      optimizationMode: "detail",
    },
  },
} as const satisfies Record<
  string,
  Pick<ClassroomMediaProfile, "camera" | "screen">
>;

const requestedPreset = process.env.NEXT_PUBLIC_CLASSROOM_VIDEO_PRESET;
const selectedPreset =
  requestedPreset === "economy" ||
  requestedPreset === "hd" ||
  requestedPreset === "fullHd"
    ? classroomVideoPresets[requestedPreset]
    : classroomVideoPresets.hd;

export const classroomMediaProfile: ClassroomMediaProfile = {
  ...selectedPreset,
  recording: {
    width: 1280,
    height: 720,
    frameRate: 15,
    bitrateKbps: 1800,
  },
};

export const classroomRuntimeDefaults = {
  // A lesson may run for up to six hours. Keep every RTC participant,
  // recorder and recorder-page credential on that same envelope so a
  // long-running class does not lose one of its background participants early.
  rtcTokenTtlSeconds: 6 * 60 * 60,
  recordingTokenTtlSeconds: 6 * 60 * 60,
  recorderPageTokenTtl: "6h",
  recordingMaxDurationHours: 6,
  // Cloud recording writes hourly files instead of one very large file. This
  // keeps a recoverable, playable boundary if an upstream recorder restarts.
  recordingSegmentDurationSeconds: 60 * 60,
  recordingMaxIdleSeconds: 5 * 60,
  screenShareUidSuffix: "::screen",
} as const;
