import type { Courseware, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getWhiteboardConversionStatus } from "@/lib/whiteboard-convert";

/** Both the library and live classroom must advance conversion tasks. */
export async function refreshCoursewareConversions(items: Courseware[]): Promise<Courseware[]> {
  return Promise.all(items.map(async (item) => {
    if (!item.whiteboardEnabled || !item.taskUuid || !["Pending", "Converting"].includes(item.taskStatus)) return item;
    let result;
    try {
      const savedRegion = item.conversion && typeof item.conversion === "object" && !Array.isArray(item.conversion) && typeof item.conversion.region === "string" ? item.conversion.region : undefined;
      result = await getWhiteboardConversionStatus(item.taskUuid, item.type === "dynamic" ? "dynamic" : "static", savedRegion);
    } catch {
      // A failed status query does not mean the remote conversion failed.
      return item;
    }
    if (result.status === item.taskStatus) return item;
    const data = {
      updatedAt: new Date(),
      taskStatus: result.status,
      conversion: result as unknown as Prisma.InputJsonValue,
      conversionError: result.errorMessage ?? null,
    };
    const changed = await prisma.courseware.updateMany({
      // A late poll must not resurrect a removed/retried whiteboard document.
      where: { id: item.id, taskUuid: item.taskUuid, taskStatus: item.taskStatus, whiteboardEnabled: true },
      data,
    });
    if (!changed.count) return await prisma.courseware.findUnique({ where: { id: item.id } }) ?? item;
    return { ...item, ...data, conversion: result as unknown as Prisma.JsonValue };
  }));
}
