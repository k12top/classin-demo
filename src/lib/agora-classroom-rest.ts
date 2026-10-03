import "server-only";

import { EducationTokenBuilder } from "agora-token/src/EducationTokenBuilder";
import {
  classroomLaunchSchedule,
  classroomSchedulesMatch,
  type ExistingClassroomSchedule,
  type ClassroomLaunchSchedule,
} from "@/lib/classroom-lifecycle";

const AGORA_CLASSROOM_REGION = "cn";
const AGORA_REST_TOKEN_TTL_SECONDS = 5 * 60;
const AGORA_REST_TIMEOUT_MS = 10_000;
type CourseTime = Date | string | null | undefined;

type AgoraRoomSchedule = ExistingClassroomSchedule;

type AgoraRoomData = {
  roomName?: string;
  roomUuid?: string;
  createTime?: number;
  roomProperties?: {
    roomType?: number;
    schedule?: AgoraRoomSchedule;
  };
};

type AgoraRestResponse = {
  code?: number;
  msg?: string;
  data?: AgoraRoomData;
};

type AgoraRestResult = {
  ok: boolean;
  status: number;
  body: AgoraRestResponse;
};

export type AgoraClassroomSchedule = ClassroomLaunchSchedule & {
  endTimeMs: number;
  closeTimeMs: number;
};

export type EnsureAgoraClassroomInput = {
  roomUuid: string;
  roomName: string;
  roomType: number;
  startTime: CourseTime;
  endTime: CourseTime;
};

export type EnsureAgoraClassroomResult = {
  created: boolean;
  roomUuid: string;
  roomType: number;
  schedule: AgoraClassroomSchedule;
  agoraSchedule: AgoraRoomSchedule | null;
};

export class AgoraClassroomRestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly agoraCode?: number,
  ) {
    super(message);
    this.name = "AgoraClassroomRestError";
  }
}

export class AgoraClassroomScheduleConflictError extends Error {
  constructor(
    readonly roomUuid: string,
    readonly expected: AgoraClassroomSchedule,
    readonly actual: AgoraRoomSchedule | null,
  ) {
    super(
      "The existing classroom schedule does not match the configured course schedule",
    );
    this.name = "AgoraClassroomScheduleConflictError";
  }
}

function requiredAgoraEnv(name: "AGORA_APP_ID" | "AGORA_APP_CERTIFICATE") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AgoraClassroomRestError(
      `Classroom service is not configured: missing ${name}`,
    );
  }
  return value;
}

function normalizeAgoraRoomType(roomType: number): number {
  // Public courses use the Agora large-class scene.
  return roomType === 10 ? 2 : roomType;
}

function buildExpectedSchedule(
  startTime: CourseTime,
  endTime: CourseTime,
): AgoraClassroomSchedule {
  const launchSchedule = classroomLaunchSchedule(startTime, endTime);
  const endTimeMs =
    launchSchedule.startTimeMs + launchSchedule.durationSeconds * 1000;

  return {
    ...launchSchedule,
    endTimeMs,
    closeTimeMs:
      endTimeMs + launchSchedule.closeDelaySeconds * 1000,
  };
}

async function requestAgoraRoom(
  method: "GET" | "POST",
  url: string,
  educationToken: string,
  body?: Record<string, unknown>,
): Promise<AgoraRestResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `agora token=${educationToken}`,
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(AGORA_REST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AgoraClassroomRestError(
      `Failed to reach classroom service: ${
        error instanceof Error ? error.message : "unknown network error"
      }`,
    );
  }

  const responseText = await response.text();
  let responseBody: AgoraRestResponse = {};
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText) as AgoraRestResponse;
    } catch {
      throw new AgoraClassroomRestError(
        "Classroom service returned an invalid response",
        response.status,
      );
    }
  }

  return {
    ok: response.ok && responseBody.code === 0,
    status: response.status,
    body: responseBody,
  };
}

function assertMatchingRoom(
  roomUuid: string,
  expected: AgoraClassroomSchedule,
  result: AgoraRestResult,
): EnsureAgoraClassroomResult {
  const actualSchedule = result.body.data?.roomProperties?.schedule ?? null;
  if (!result.ok || !classroomSchedulesMatch(expected, actualSchedule)) {
    if (result.ok) {
      throw new AgoraClassroomScheduleConflictError(
        roomUuid,
        expected,
        actualSchedule,
      );
    }
    throw new AgoraClassroomRestError(
      result.body.msg || "Failed to query classroom",
      result.status,
      result.body.code,
    );
  }

  return {
    created: false,
    roomUuid,
    roomType: result.body.data?.roomProperties?.roomType ?? 0,
    schedule: expected,
    agoraSchedule: actualSchedule,
  };
}

/**
 * Ensure Agora stores the platform's authoritative course schedule before any
 * browser launches the Classroom SDK. This removes the SDK's "first client
 * wins" race, which otherwise can permanently create a 30-minute room.
 */
export async function ensureAgoraClassroom(
  input: EnsureAgoraClassroomInput,
): Promise<EnsureAgoraClassroomResult> {
  const appId = requiredAgoraEnv("AGORA_APP_ID");
  const appCertificate = requiredAgoraEnv("AGORA_APP_CERTIFICATE");
  const roomUuid = input.roomUuid.trim();
  const roomType = normalizeAgoraRoomType(input.roomType);
  const schedule = buildExpectedSchedule(input.startTime, input.endTime);
  const educationToken = EducationTokenBuilder.buildAppToken(
    appId,
    appCertificate,
    AGORA_REST_TOKEN_TTL_SECONDS,
  );
  const roomUrl = `https://api.sd-rtn.com/${AGORA_CLASSROOM_REGION}/edu/apps/${encodeURIComponent(
    appId,
  )}/v2/rooms/${encodeURIComponent(roomUuid)}`;

  const existing = await requestAgoraRoom("GET", roomUrl, educationToken);
  if (existing.ok) {
    return assertMatchingRoom(roomUuid, schedule, existing);
  }

  const roomMissing =
    existing.status === 404 || existing.body.code === 20404100;
  if (!roomMissing) {
    throw new AgoraClassroomRestError(
      existing.body.msg || "Failed to query classroom",
      existing.status,
      existing.body.code,
    );
  }

  const created = await requestAgoraRoom("POST", roomUrl, educationToken, {
    roomName: input.roomName,
    roomType,
    roomProperties: {
      schedule: {
        startTime: schedule.startTimeMs,
        duration: schedule.durationSeconds,
        closeDelay: schedule.closeDelaySeconds,
      },
    },
  });

  if (created.ok) {
    console.info("[classroom:agora-room]", {
      action: "created",
      roomUuid,
      roomType,
      schedule,
    });
    return {
      created: true,
      roomUuid,
      roomType,
      schedule,
      agoraSchedule: null,
    };
  }

  // Concurrent first entrants can both observe a missing room. If another
  // request created it first, query once more and validate its schedule.
  const racedRoom = await requestAgoraRoom("GET", roomUrl, educationToken);
  if (racedRoom.ok) {
    return assertMatchingRoom(roomUuid, schedule, racedRoom);
  }

  throw new AgoraClassroomRestError(
    created.body.msg || "Failed to create classroom",
    created.status,
    created.body.code,
  );
}
