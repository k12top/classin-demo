import "server-only";

import { createHash } from "node:crypto";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { classroomRuntimeDefaults } from "@/lib/classroom/config";
import { buildScreenShareUserId } from "@/lib/classroom/screen-share";
import {
  ClassroomProviderConfigurationError,
  ClassroomProviderRequestError,
} from "@/lib/classroom/server/errors";
import type {
  ClassroomServerProvider,
  IssueClassroomCredentialInput,
  RecordingProvider,
  RecordingQueryResult,
  RecordingStartInput,
  RecordingStartResult,
  RecordingStopInput,
  RecordingStopResult,
} from "@/lib/classroom/server/types";
import type { ClassroomJoinCredential } from "@/lib/classroom/types";
import {
  expectedAgoraRecordingStorageRegion,
  validateAgoraRecordingStorageRegion,
} from "@/lib/classroom/recording-storage";

const AGORA_ALIYUN_VENDOR_ID = 2;
const AGORA_REQUEST_TIMEOUT_MS = 15_000;

type AgoraRecordingResponse = {
  resourceId?: string;
  sid?: string;
  serverResponse?: {
    status?: number;
    fileList?: unknown[];
    uploadingStatus?: string;
    [key: string]: unknown;
  };
  code?: number;
  reason?: string;
  [key: string]: unknown;
};

type AgoraRecordingFile = {
  fileName?: string;
  filename?: string;
  isPlayable?: boolean;
};

function requiredEnv(names: readonly string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new ClassroomProviderConfigurationError(
      `Classroom provider is not configured: missing ${missing.join(", ")}`,
      missing,
    );
  }

  return Object.fromEntries(
    names.map((name) => [name, process.env[name]!.trim()]),
  );
}

function agoraAppCredentials() {
  const env = requiredEnv(["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"]);
  return {
    appId: env.AGORA_APP_ID,
    appCertificate: env.AGORA_APP_CERTIFICATE,
  };
}

function buildRtcToken(
  channelName: string,
  userId: string,
  publisher: boolean,
  expiresInSeconds: number,
): string {
  const { appId, appCertificate } = agoraAppCredentials();
  return RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channelName,
    userId,
    publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
    expiresInSeconds,
    expiresInSeconds,
  );
}

export class AgoraClassroomServerProvider implements ClassroomServerProvider {
  readonly name = "agora" as const;

  issueCredential(
    input: IssueClassroomCredentialInput,
  ): ClassroomJoinCredential {
    const { appId } = agoraAppCredentials();
    const publisher = input.publisher ?? input.role !== "student";
    const allowScreenShare =
      input.allowScreenShare ?? input.role !== "student";
    const expiresInSeconds = classroomRuntimeDefaults.rtcTokenTtlSeconds;
    const credential: ClassroomJoinCredential = {
      provider: this.name,
      scenario: input.scenario ?? "liveBroadcasting",
      appId,
      channelName: input.channelName,
      userId: input.userId,
      role: input.role,
      publishAllowed: publisher,
      token: buildRtcToken(
        input.channelName,
        input.userId,
        publisher,
        expiresInSeconds,
      ),
      expiresInSeconds,
    };

    if (publisher && allowScreenShare) {
      const screenUserId = buildScreenShareUserId(input.userId);
      credential.screenShare = {
        userId: screenUserId,
        token: buildRtcToken(
          input.channelName,
          screenUserId,
          true,
          expiresInSeconds,
        ),
      };
    }

    return credential;
  }
}

function positiveIntegerEnv(name: string, fallback?: number): number {
  const raw = process.env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new ClassroomProviderConfigurationError(
      `${name} must be a non-negative integer`,
      raw ? [] : [name],
    );
  }
  return value;
}

function recordingConfiguration() {
  const env = requiredEnv([
    "AGORA_APP_ID",
    "AGORA_APP_CERTIFICATE",
    "AGORA_REST_CUSTOMER_ID",
    "AGORA_REST_CUSTOMER_SECRET",
    "AGORA_RECORDING_STORAGE_REGION",
    "ALIYUN_OSS_REGION",
    "ALIYUN_OSS_BUCKET",
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
  ]);

  const apiOrigin = (process.env.AGORA_API_BASE_URL || "https://api.sd-rtn.com")
    .trim()
    .replace(/\/+$/, "");
  const apiRegion = (process.env.AGORA_RECORDING_API_REGION || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const storageRegion = positiveIntegerEnv("AGORA_RECORDING_STORAGE_REGION");
  if (!validateAgoraRecordingStorageRegion(env.ALIYUN_OSS_REGION, storageRegion)) {
    const expected = expectedAgoraRecordingStorageRegion(env.ALIYUN_OSS_REGION);
    throw new ClassroomProviderConfigurationError(
      `AGORA_RECORDING_STORAGE_REGION must be ${expected} for ${env.ALIYUN_OSS_REGION}`,
      [],
    );
  }
  const storageEndpoint = (
    process.env.AGORA_RECORDING_STORAGE_ENDPOINT ||
    `https://${env.ALIYUN_OSS_BUCKET}.${env.ALIYUN_OSS_REGION}.aliyuncs.com`
  ).trim();
  return {
    appId: env.AGORA_APP_ID,
    appCertificate: env.AGORA_APP_CERTIFICATE,
    customerId: env.AGORA_REST_CUSTOMER_ID,
    customerSecret: env.AGORA_REST_CUSTOMER_SECRET,
    storageRegion,
    apiBase: `${apiOrigin}${apiRegion ? `/${apiRegion}` : ""}/v1/apps`,
    regionAffinity: positiveIntegerEnv("AGORA_RECORDING_REGION_AFFINITY", 2),
    storageEndpoint,
    bucket: env.ALIYUN_OSS_BUCKET,
    accessKey: env.ALIYUN_OSS_ACCESS_KEY_ID,
    secretKey: env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    maxIdleSeconds: positiveIntegerEnv(
      "AGORA_RECORDING_MAX_IDLE_SECONDS",
      classroomRuntimeDefaults.recordingMaxIdleSeconds,
    ),
    prefix: (process.env.AGORA_RECORDING_PREFIX || "recordings")
      .trim()
      .replace(/^\/+|\/+$/g, ""),
  };
}

function recorderUserId(courseId: string): string {
  const digest = createHash("sha256").update(courseId).digest();
  const uid = digest.readUInt32BE(0) || 1;
  return String(uid);
}

function basicAuthorization(customerId: string, customerSecret: string) {
  return `Basic ${Buffer.from(`${customerId}:${customerSecret}`).toString(
    "base64",
  )}`;
}

async function agoraRecordingRequest(
  path: string,
  body: Record<string, unknown>,
  config: ReturnType<typeof recordingConfiguration>,
): Promise<AgoraRecordingResponse> {
  const response = await fetch(
    `${config.apiBase}/${encodeURIComponent(config.appId)}${path}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: basicAuthorization(
          config.customerId,
          config.customerSecret,
        ),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(AGORA_REQUEST_TIMEOUT_MS),
    },
  );

  const text = await response.text();
  let payload: AgoraRecordingResponse = {};
  if (text) {
    try {
      payload = JSON.parse(text) as AgoraRecordingResponse;
    } catch {
      throw new ClassroomProviderRequestError(
        "Agora recording returned invalid JSON",
        response.status,
        text,
      );
    }
  }

  if (!response.ok) {
    throw new ClassroomProviderRequestError(
      payload.reason || "Agora recording request failed",
      response.status,
      payload,
    );
  }
  return payload;
}

function fileNameOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const file = value as AgoraRecordingFile;
  const filename = file.fileName || file.filename;
  return typeof filename === "string" && filename.trim()
    ? filename.trim().replace(/^\/+/, "")
    : null;
}

export function selectAgoraRecordingPlayback(
  files: unknown[],
  prefixSegments: string[],
): { objectKey: string | null; format: "mp4" | "hls" | null } {
  const candidates = files
    .map((file) => ({
      file,
      name: fileNameOf(file),
      playable:
        typeof file === "object" &&
        file !== null &&
        (file as AgoraRecordingFile).isPlayable !== false,
    }))
    .filter(
      (candidate): candidate is {
        file: unknown;
        name: string;
        playable: boolean;
      } => Boolean(candidate.name),
    );
  const selected = candidates.find(
    (candidate) =>
      candidate.playable && candidate.name.toLowerCase().endsWith(".mp4"),
  ) ?? candidates.find(
    (candidate) =>
      candidate.playable && candidate.name.toLowerCase().endsWith(".m3u8"),
  );
  if (!selected) return { objectKey: null, format: null };

  const prefix = prefixSegments.filter(Boolean).join("/");
  const objectKey = selected.name.startsWith(`${prefix}/`)
    ? selected.name
    : `${prefix}/${selected.name}`;
  return {
    objectKey,
    format: selected.name.toLowerCase().endsWith(".mp4") ? "mp4" : "hls",
  };
}

function responseFiles(payload: AgoraRecordingResponse): unknown[] {
  if (Array.isArray(payload.serverResponse?.fileList)) {
    return payload.serverResponse.fileList;
  }
  const states = payload.serverResponse?.extensionServiceState;
  if (!Array.isArray(states)) return [];
  return states.flatMap((state) => {
    if (!state || typeof state !== "object") return [];
    const payloadValue = (state as { payload?: unknown }).payload;
    if (!payloadValue || typeof payloadValue !== "object") return [];
    const files = (payloadValue as { fileList?: unknown }).fileList;
    return Array.isArray(files) ? files : [];
  });
}

export class AgoraCloudRecordingProvider implements RecordingProvider {
  readonly name = "agora" as const;

  isConfigured(): boolean {
    try {
      recordingConfiguration();
      return true;
    } catch {
      return false;
    }
  }

  async start(input: RecordingStartInput): Promise<RecordingStartResult> {
    const config = recordingConfiguration();
    const recorderUid = recorderUserId(input.courseId);
    const fileNamePrefix = [
      config.prefix,
      input.courseId,
      input.recordingId,
    ].filter(Boolean);
    if (input.pageUrl) {
      try {
        return await this.startWebRecording(
          input,
          config,
          recorderUid,
          fileNamePrefix,
        );
      } catch (error) {
        const allowRawMixFallback =
          process.env.AGORA_ALLOW_RAW_MIX_FALLBACK?.trim().toLowerCase() ===
          "true";
        console.error("[classroom:recording] composited web mode failed", {
          courseId: input.courseId,
          message: error instanceof Error ? error.message : String(error),
          allowRawMixFallback,
        });
        // A raw RTC mix cannot contain the Netless canvas or DOM composition
        // layer. Preserve the whiteboard-in-recording contract unless an
        // operator explicitly accepts that degraded legacy fallback.
        if (!allowRawMixFallback) throw error;
        const mixed = await this.startMixedRecording(
          input,
          config,
          recorderUid,
          fileNamePrefix,
        );
        return { ...mixed, fallbackFrom: "web" };
      }
    }
    return this.startMixedRecording(
      input,
      config,
      recorderUid,
      fileNamePrefix,
    );
  }

  private async acquire(
    input: RecordingStartInput,
    config: ReturnType<typeof recordingConfiguration>,
    recorderUid: string,
    web: boolean,
  ): Promise<AgoraRecordingResponse & { resourceId: string }> {
    const acquire = await agoraRecordingRequest(
      "/cloud_recording/acquire",
      {
        cname: input.channelName,
        uid: recorderUid,
        clientRequest: {
          resourceExpiredHour: 1,
          regionAffinity: config.regionAffinity,
          ...(web ? { scene: 1 } : {}),
        },
      },
      config,
    );
    if (!acquire.resourceId) {
      throw new ClassroomProviderRequestError(
        "Agora recording acquire response is missing resourceId",
        502,
        acquire,
      );
    }
    return acquire as AgoraRecordingResponse & { resourceId: string };
  }

  private recorderToken(
    input: RecordingStartInput,
    config: ReturnType<typeof recordingConfiguration>,
    recorderUid: string,
  ) {
    return RtcTokenBuilder.buildTokenWithUid(
      config.appId,
      config.appCertificate,
      input.channelName,
      Number(recorderUid),
      RtcRole.SUBSCRIBER,
      classroomRuntimeDefaults.recordingTokenTtlSeconds,
      classroomRuntimeDefaults.recordingTokenTtlSeconds,
    );
  }

  private async startMixedRecording(
    input: RecordingStartInput,
    config: ReturnType<typeof recordingConfiguration>,
    recorderUid: string,
    fileNamePrefix: string[],
  ): Promise<RecordingStartResult> {
    const acquire = await this.acquire(input, config, recorderUid, false);
    const recorderToken = this.recorderToken(input, config, recorderUid);
    const recording = input.mediaProfile.recording;
    const started = await agoraRecordingRequest(
      `/cloud_recording/resourceid/${encodeURIComponent(
        acquire.resourceId,
      )}/mode/mix/start`,
      {
        cname: input.channelName,
        uid: recorderUid,
        clientRequest: {
          token: recorderToken,
          recordingConfig: {
            channelType: 1,
            streamTypes: 2,
            audioProfile: 2,
            maxIdleTime: config.maxIdleSeconds,
            transcodingConfig: {
              width: recording.width,
              height: recording.height,
              fps: recording.frameRate,
              bitrate: recording.bitrateKbps,
              mixedVideoLayout: 0,
              backgroundColor: "#0b1020",
            },
            subscribeVideoUids: ["#allstream#"],
            subscribeAudioUids: ["#allstream#"],
          },
          recordingFileConfig: {
            avFileType: ["hls", "mp4"],
          },
          storageConfig: {
            vendor: AGORA_ALIYUN_VENDOR_ID,
            region: config.storageRegion,
            bucket: config.bucket,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            fileNamePrefix,
          },
        },
      },
      config,
    );
    if (!started.sid) {
      throw new ClassroomProviderRequestError(
        "Agora recording start response is missing sid",
        502,
        started,
      );
    }

    return {
      recorderUserId: recorderUid,
      resourceId: acquire.resourceId,
      providerSessionId: started.sid,
      providerState: {
        mode: "mix",
        fileNamePrefix,
        storageEndpoint: config.storageEndpoint,
        acquire,
        started,
      },
      mode: "mix",
    };
  }

  private async startWebRecording(
    input: RecordingStartInput,
    config: ReturnType<typeof recordingConfiguration>,
    recorderUid: string,
    fileNamePrefix: string[],
  ): Promise<RecordingStartResult> {
    if (!input.pageUrl) throw new Error("Recorder page URL is missing");
    const acquire = await this.acquire(input, config, recorderUid, true);
    const recorderToken = this.recorderToken(input, config, recorderUid);
    const recording = input.mediaProfile.recording;
    const maxRecordingHour = Math.min(
      24,
      Math.max(
        1,
        positiveIntegerEnv("AGORA_PAGE_RECORDING_MAX_HOURS", 8),
      ),
    );
    const started = await agoraRecordingRequest(
      `/cloud_recording/resourceid/${encodeURIComponent(
        acquire.resourceId,
      )}/mode/web/start`,
      {
        cname: input.channelName,
        uid: recorderUid,
        clientRequest: {
          token: recorderToken,
          extensionServiceConfig: {
            errorHandlePolicy: "error_abort",
            extensionServices: [
              {
                serviceName: "web_recorder_service",
                errorHandlePolicy: "error_abort",
                serviceParam: {
                  url: input.pageUrl,
                  audioProfile: 0,
                  videoWidth: recording.width,
                  videoHeight: recording.height,
                  maxRecordingHour,
                  maxVideoDuration: 3600,
                },
              },
            ],
          },
          recordingFileConfig: {
            avFileType: ["hls", "mp4"],
          },
          storageConfig: {
            vendor: AGORA_ALIYUN_VENDOR_ID,
            region: config.storageRegion,
            bucket: config.bucket,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            fileNamePrefix,
          },
        },
      },
      config,
    );
    if (!started.sid) {
      throw new ClassroomProviderRequestError(
        "Agora web recording start response is missing sid",
        502,
        started,
      );
    }
    return {
      recorderUserId: recorderUid,
      resourceId: acquire.resourceId,
      providerSessionId: started.sid,
      providerState: {
        mode: "web",
        fileNamePrefix,
        storageEndpoint: config.storageEndpoint,
        acquire,
        started,
      },
      mode: "web",
    };
  }

  async query(input: RecordingStopInput): Promise<RecordingQueryResult> {
    const config = recordingConfiguration();
    const response = await fetch(
      `${config.apiBase}/${encodeURIComponent(
        config.appId,
      )}/cloud_recording/resourceid/${encodeURIComponent(
        input.resourceId,
      )}/sid/${encodeURIComponent(
        input.providerSessionId,
      )}/mode/${input.providerState?.mode === "web" ? "web" : "mix"}/query`,
      {
        headers: {
          Accept: "application/json",
          Authorization: basicAuthorization(
            config.customerId,
            config.customerSecret,
          ),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(AGORA_REQUEST_TIMEOUT_MS),
      },
    );
    const text = await response.text();
    const payload = text
      ? (JSON.parse(text) as AgoraRecordingResponse)
      : ({} as AgoraRecordingResponse);
    if (!response.ok) {
      throw new ClassroomProviderRequestError(
        payload.reason || "Agora recording query failed",
        response.status,
        payload,
      );
    }

    const status = payload.serverResponse?.status;
    const files = responseFiles(payload);
    const prefixSegments = Array.isArray(input.providerState?.fileNamePrefix)
      ? input.providerState.fileNamePrefix.filter(
          (segment): segment is string => typeof segment === "string",
        )
      : [];
    const playback = selectAgoraRecordingPlayback(files, prefixSegments);
    return {
      active: status === 4 || status === 5,
      files,
      playbackObjectKey: playback.objectKey,
      playbackFormat: playback.format,
      providerState: payload,
    };
  }

  async stop(input: RecordingStopInput): Promise<RecordingStopResult> {
    const config = recordingConfiguration();
    const stopped = await agoraRecordingRequest(
      `/cloud_recording/resourceid/${encodeURIComponent(
        input.resourceId,
      )}/sid/${encodeURIComponent(
        input.providerSessionId,
      )}/mode/${input.providerState?.mode === "web" ? "web" : "mix"}/stop`,
      {
        cname: input.channelName,
        uid: input.recorderUserId,
        clientRequest: {
          async_stop: false,
        },
      },
      config,
    );
    const files = responseFiles(stopped);
    const prefixSegments = Array.isArray(
      input.providerState?.fileNamePrefix,
    )
      ? input.providerState.fileNamePrefix.filter(
          (segment): segment is string => typeof segment === "string",
        )
      : [];

    const playback = selectAgoraRecordingPlayback(files, prefixSegments);
    return {
      playbackObjectKey: playback.objectKey,
      playbackFormat: playback.format,
      files,
      providerState: stopped,
    };
  }
}
