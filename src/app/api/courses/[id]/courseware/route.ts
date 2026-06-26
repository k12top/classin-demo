import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Courseware } from "@prisma/client";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import {
  startWhiteboardConversion,
  getWhiteboardConversionStatus,
} from "@/lib/whiteboard-convert";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Fetch all courseware items
    const items = await prisma.courseware.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });

    // Proactively refresh conversion status for items that are not fully finished or failed yet
    const refreshedItems = await Promise.all(
      items.map(async (item: Courseware) => {
        if (
          item.taskUuid &&
          (item.taskStatus === "Pending" || item.taskStatus === "Converting")
        ) {
          try {
            const statusResult = await getWhiteboardConversionStatus(
              item.taskUuid,
              item.type as "static" | "dynamic",
              item.name,
              item.url
            );

            if (statusResult.status !== item.taskStatus) {
              const updated = await prisma.courseware.update({
                where: { id: item.id },
                data: {
                  taskStatus: statusResult.status,
                  conversion: statusResult.scenes as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                },
              });
              return updated;
            }
          } catch (e) {
            console.error(`Failed to refresh status for task ${item.taskUuid}:`, e);
          }
        }
        return item;
      })
    );

    return NextResponse.json(
      { courseware: refreshedItems },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch courseware:", error);
    return NextResponse.json({ error: "Failed to fetch courseware" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    if (
      session.role !== "teacher" ||
      !(await assertCanTeachCourse(session.userId, courseId))
    ) {
      return NextResponse.json({ error: "Only the teacher can upload courseware" }, { status: 403 });
    }

    const body = await request.json();
    const { name, url, ext, size } = body;

    if (!name?.trim() || !url?.trim() || !ext?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: name, url, ext" },
        { status: 400 }
      );
    }

    const cleanExt = ext.toLowerCase().replace(/^\./, "");
    
    // Start whiteboard document conversion.
    const conversion = await startWhiteboardConversion(url.trim(), cleanExt);

    // Initial status polling
    const finalStatus = await getWhiteboardConversionStatus(
      conversion.taskUuid,
      conversion.type,
      name.trim(),
      url.trim()
    );

    const item = await prisma.courseware.create({
      data: {
        courseId,
        name: name.trim(),
        ext: cleanExt,
        size: size || 0,
        url: url.trim(),
        taskUuid: conversion.taskUuid,
        type: conversion.type,
        taskStatus: finalStatus.status,
        conversion: finalStatus.scenes as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    });

    return NextResponse.json({ courseware: item }, { status: 201 });
  } catch (error) {
    console.error("Failed to create courseware:", error);
    return NextResponse.json({ error: "Failed to create courseware" }, { status: 500 });
  }
}
