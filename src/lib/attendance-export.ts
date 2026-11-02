export type AttendanceExportRow = {
  studentId: string;
  studentName: string;
  sessionCount: number;
  totalDurationSec: number;
  online: boolean;
  closedByCourseEnd: boolean;
  status: "attended" | "excused";
  leaveReason: string;
};

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function buildAttendanceCsv(rows: AttendanceExportRow[]): string {
  const header = [
    "studentId",
    "studentName",
    "sessionCount",
    "totalDurationSec",
    "totalDuration",
    "online",
    "closedByCourseEnd",
    "status",
    "leaveReason",
  ];
  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((row) =>
      [
        row.studentId,
        row.studentName,
        row.sessionCount,
        row.totalDurationSec,
        formatDuration(row.totalDurationSec),
        row.online ? "true" : "false",
        row.closedByCourseEnd ? "true" : "false",
        row.status,
        row.leaveReason,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];
  return lines.join("\n");
}
