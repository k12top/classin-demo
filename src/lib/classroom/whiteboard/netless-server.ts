import "server-only";

import type { ClassroomWhiteboardCredential } from "@/lib/classroom/types";
import type {
  ClassroomWhiteboardProvider,
  WhiteboardJoinInput,
} from "@/lib/classroom/whiteboard/types";
import { ensureClassroomRuntime } from "@/lib/classroom/server/runtime";
import { prisma } from "@/lib/db";

const API_BASE = "https://api.netless.link/v5";
const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const VALID_REGIONS = new Set(["cn-hz", "us-sv", "sg", "in-mum", "eu"]);
const roomCreationBySession = new Map<string, Promise<string>>();

type NetlessConfig = {
  appIdentifier: string;
  sdkToken: string;
  region: "cn-hz" | "us-sv" | "sg" | "in-mum" | "eu";
};

function configuration(): NetlessConfig | null {
  const appIdentifier = process.env.WHITEBOARD_APP_IDENTIFIER?.trim();
  const sdkToken = process.env.WHITEBOARD_SDK_TOKEN?.trim();
  const rawRegion = (process.env.WHITEBOARD_REGION || "sg").trim();
  if (!appIdentifier || !sdkToken || !VALID_REGIONS.has(rawRegion)) {
    return null;
  }
  return {
    appIdentifier,
    sdkToken,
    region: rawRegion as NetlessConfig["region"],
  };
}

async function requestNetless(
  path: string,
  init: RequestInit,
  config: NetlessConfig,
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      region: config.region,
      token: config.sdkToken,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : `HTTP ${response.status}`;
    throw new Error(`白板服务请求失败：${detail}`);
  }
  return payload;
}

async function ensureRoom(
  courseId: string,
  sessionId: string,
  config: NetlessConfig,
) {
  const runtime = await ensureClassroomRuntime(courseId, sessionId);
  if (runtime.whiteboardRoomUuid) return runtime.whiteboardRoomUuid;

  const inFlight = roomCreationBySession.get(sessionId);
  if (inFlight) return inFlight;

  const createRoom = async () => {
    // The first classroom entry can be retried by React or requested by more
    // than one participant. Only one Netless room creation should be allowed
    // to leave this process; every caller can then mint its own room token.
    const latestRuntime = await ensureClassroomRuntime(courseId, sessionId);
    if (latestRuntime.whiteboardRoomUuid) return latestRuntime.whiteboardRoomUuid;

    const created = (await requestNetless(
      "/rooms",
      {
        method: "POST",
        body: JSON.stringify({
          name: `classroom-${sessionId}`,
          isRecord: true,
          limit: 0,
        }),
      },
      config,
    )) as { uuid?: unknown };
    if (typeof created.uuid !== "string" || !created.uuid) {
      throw new Error("白板服务未返回房间 UUID");
    }

    await prisma.classroomRuntime.updateMany({
      where: { id: latestRuntime.id, whiteboardRoomUuid: null },
      data: { whiteboardRoomUuid: created.uuid, revision: { increment: 1 } },
    });
    const current = await prisma.classroomRuntime.findUniqueOrThrow({
      where: { id: latestRuntime.id },
      select: { whiteboardRoomUuid: true },
    });
    return current.whiteboardRoomUuid || created.uuid;
  };

  const task = createRoom();
  roomCreationBySession.set(sessionId, task);
  try {
    return await task;
  } finally {
    if (roomCreationBySession.get(sessionId) === task) {
      roomCreationBySession.delete(sessionId);
    }
  }
}

export class NetlessWhiteboardProvider
  implements ClassroomWhiteboardProvider
{
  readonly name = "netless" as const;

  isConfigured(): boolean {
    return configuration() !== null;
  }

  async issueJoinCredential(
    input: WhiteboardJoinInput,
  ): Promise<ClassroomWhiteboardCredential> {
    const config = configuration();
    if (!config) {
      return {
        enabled: false,
        provider: this.name,
        writable: false,
        error:
          "互动白板尚未配置，请设置 WHITEBOARD_APP_IDENTIFIER、WHITEBOARD_SDK_TOKEN 和 WHITEBOARD_REGION",
      };
    }

    try {
      const roomUuid = await ensureRoom(
        input.courseId,
        input.sessionId,
        config,
      );
      const writable =
        input.role === "teacher" ||
        input.role === "assistant" ||
        input.writable;
      const token = await requestNetless(
        `/tokens/rooms/${encodeURIComponent(roomUuid)}`,
        {
          method: "POST",
          body: JSON.stringify({
            lifespan: TOKEN_TTL_MS,
            role: writable ? "writer" : "reader",
          }),
        },
        config,
      );
      if (typeof token !== "string" || !token.startsWith("NETLESSROOM_")) {
        throw new Error("白板服务未返回有效的房间 Token");
      }
      return {
        enabled: true,
        provider: this.name,
        appIdentifier: config.appIdentifier,
        region: config.region,
        roomUuid,
        roomToken: token,
        writable,
      };
    } catch (error) {
      console.error("[classroom:whiteboard] credential failed", {
        courseId: input.courseId,
        sessionId: input.sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        enabled: false,
        provider: this.name,
        writable: false,
        error:
          error instanceof Error ? error.message : "无法连接互动白板服务",
      };
    }
  }
}
