import "server-only";

import { createHash } from "node:crypto";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { classroomRuntimeDefaults } from "@/lib/classroom/config";
import { buildScreenShareUserId } from "@/lib/classroom/screen-share";
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

const AGORA_RECORDING_API_BASE = "https://api.sd-rtn.com/v1/apps";
const AGORA_RECORDING_MODE = "mix";
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

export class ClassroomProviderConfigurationError extends Error {
  constructor(
    message: string,
    readonly missingVariables: readonly string[] = [],
  ) {
    super(message);
    this.name = "ClassroomProviderConfigurationError";
  }
}

export class ClassroomProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response: unknown,
  ) {
    super(message);
    this.name = "ClassroomProviderRequestError";
  }
}

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
    const publisher = input.role !== "student";
    const expiresInSeconds = classroomRuntimeDefaults.rtcTokenTtlSeconds;
    const credential: ClassroomJoinCredential = {
      provider: this.name,
      appId,
      channelName: input.channelName,
      userId: input.userId,
      role: input.role,
      token: buildRtcToken(
        input.channelName,
        input.userId,
        publisher,
        expiresInSeconds,
      ),
      expiresInSeconds,
    };

    if (publisher) {
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
    "ALIYUN_OSS_BUCKET",
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
  ]);

  return {
    appId: env.AGORA_APP_ID,
    appCertificate: env.AGORA_APP_CERTIFICATE,
    customerId: env.AGORA_REST_CUSTOMER_ID,
    customerSecret: env.AGORA_REST_CUSTOMER_SECRET,
    storageRegion: positiveIntegerEnv("AGORA_RECORDING_STORAGE_REGION"),
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
    `${AGORA_RECORDING_API_BASE}/${encodeURIComponent(config.appId)}${path}`,
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

function selectPlaybackObjectKey(
  files: unknown[],
  prefixSegments: string[],
): string | null {
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
  const selected =
    candidates.find(
      (candidate) =>
        candidate.playable && candidate.name.toLowerCase().endsWith(".mp4"),
    ) ||
    candidates.find(
      (candidate) =>
        candidate.playable && candidate.name.toLowerCase().endsWith(".m3u8"),
    );
  if (!selected) return null;

  const prefix = prefixSegments.filter(Boolean).join("/");
  return selected.name.startsWith(`${prefix}/`)
    ? selected.name
    : `${prefix}/${selected.name}`;
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
    const acquire = await agoraRecordingRequest(
      "/cloud_recording/acquire",
      {
        cname: input.channelName,
        uid: recorderUid,
        clientRequest: {
          resourceExpiredHour: 1,
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

    const recorderToken = RtcTokenBuilder.buildTokenWithUserAccount(
      config.appId,
      config.appCertificate,
      input.channelName,
      recorderUid,
      RtcRole.SUBSCRIBER,
      classroomRuntimeDefaults.recordingTokenTtlSeconds,
      classroomRuntimeDefaults.recordingTokenTtlSeconds,
    );
    const recording = input.mediaProfile.recording;
    const started = await agoraRecordingRequest(
      `/cloud_recording/resourceid/${encodeURIComponent(
        acquire.resourceId,
      )}/mode/${AGORA_RECORDING_MODE}/start`,
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
        fileNamePrefix,
        acquire,
        started,
      },
    };
  }

  async query(input: RecordingStopInput): Promise<RecordingQueryResult> {
    const config = recordingConfiguration();
    const response = await fetch(
      `${AGORA_RECORDING_API_BASE}/${encodeURIComponent(
        config.appId,
      )}/cloud_recording/resourceid/${encodeURIComponent(
        input.resourceId,
      )}/sid/${encodeURIComponent(
        input.providerSessionId,
      )}/mode/${AGORA_RECORDING_MODE}/query`,
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
    return {
      active: status === 4 || status === 5,
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
      )}/mode/${AGORA_RECORDING_MODE}/stop`,
      {
        cname: input.channelName,
        uid: input.recorderUserId,
        clientRequest: {
          async_stop: false,
        },
      },
      config,
    );
    const files = Array.isArray(stopped.serverResponse?.fileList)
      ? stopped.serverResponse.fileList
      : [];
    const prefixSegments = Array.isArray(
      input.providerState?.fileNamePrefix,
    )
      ? input.providerState.fileNamePrefix.filter(
          (segment): segment is string => typeof segment === "string",
        )
      : [];

    return {
      playbackObjectKey: selectPlaybackObjectKey(files, prefixSegments),
      files,
      providerState: stopped,
    };
  }
}

