import { NextRequest, NextResponse } from "next/server";
import { buildRoomUserToken } from "@/lib/agora-token";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomUuid, userUuid, role } = body;

    if (!roomUuid || !userUuid || role === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: roomUuid, userUuid, role" },
        { status: 400 }
      );
    }

    const appId = process.env.AGORA_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing AGORA_APP_ID" },
        { status: 500 }
      );
    }

    const token = buildRoomUserToken(roomUuid, userUuid, Number(role));

    return NextResponse.json({ token, appId });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
