"use client";

import { useRef, useState } from "react";
import { BookOpen, Check, Download, Eye, EyeOff, FileText, Loader2, Presentation, RefreshCw, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ClassroomCoursewareSnapshot } from "@/lib/classroom/types";

export type CoursewareUpdate = Partial<Pick<ClassroomCoursewareSnapshot, "studentCanView" | "studentCanDownload" | "whiteboardEnabled">>;
export type CoursewareInsertion = { status: "inserting" | "inserted" | "failed"; error?: string };

export function CoursewarePanel({ items, canManage, busy, insertion, boardAvailable, onOpen, onUpdate }: {
  items: ClassroomCoursewareSnapshot[];
  canManage: boolean;
  busy: string | null;
  insertion: Record<string, CoursewareInsertion>;
  boardAvailable: boolean;
  onOpen: (item: ClassroomCoursewareSnapshot) => Promise<void>;
  onUpdate: (id: string, update: CoursewareUpdate) => Promise<void>;
}) {
  const { t } = useTranslation();
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<Record<string, CoursewareUpdate>>({});
  const [notices, setNotices] = useState<Record<string, { error: boolean; text: string; action?: "open" }>>({});

  async function save(item: ClassroomCoursewareSnapshot, update: CoursewareUpdate) {
    if (locks.current.has(item.id)) return;
    locks.current.add(item.id);
    setPending(old => ({ ...old, [item.id]: update }));
    setNotices(old => ({ ...old, [item.id]: { error: false, text: t("classroom.v3.coursewareSaving") } }));
    try {
      await onUpdate(item.id, update);
      setNotices(old => ({ ...old, [item.id]: { error: false, text: t(update.whiteboardEnabled === true ? "classroom.v3.coursewareStartAccepted" : "classroom.v3.coursewareSaved") } }));
    } catch (error) {
      setNotices(old => ({ ...old, [item.id]: { error: true, text: error instanceof Error ? error.message : t("classroom.v3.coursewareUpdateFailed") } }));
    } finally {
      locks.current.delete(item.id);
      setPending(old => { const next = { ...old }; delete next[item.id]; return next; });
    }
  }

  async function open(item: ClassroomCoursewareSnapshot) {
    if (locks.current.has(item.id)) return;
    locks.current.add(item.id);
    setPending(old => ({ ...old, [item.id]: {} }));
    setNotices(old => ({ ...old, [item.id]: { error: false, text: t("classroom.v3.coursewareOpening"), action: "open" } }));
    try { await onOpen(item); }
    catch (error) { setNotices(old => ({ ...old, [item.id]: { error: true, text: error instanceof Error ? error.message : t("classroom.v3.addToWhiteboardFailed") } })); }
    finally {
      locks.current.delete(item.id);
      setPending(old => { const next = { ...old }; delete next[item.id]; return next; });
    }
  }

  return <div className="classroom-v3-panel-body">
    <div className="classroom-v3-panel-heading"><div><small>{t("classroom.v3.courseFilesEyebrow")}</small><h2>{t("classroom.v3.coursewareTitle")}</h2></div><span>{t("classroom.v3.coursewareCount", { count: items.length })}</span></div>
    <div className="classroom-v3-courseware-list">
      {!items.length && <div className="classroom-v3-panel-empty"><BookOpen /><strong>{t("classroom.v3.coursewareEmpty")}</strong><p>{t("classroom.v3.coursewareHint")}</p></div>}
      {items.map(item => {
        const update = pending[item.id];
        const waiting = update !== undefined || busy === `courseware-${item.id}`;
        const converting = item.whiteboardEnabled && ["Pending", "Converting"].includes(item.taskStatus);
        const ready = item.whiteboardEnabled && item.taskStatus === "Finished";
        const failed = item.whiteboardEnabled && item.taskStatus === "Failed";
        const board = insertion[item.id];
        const status = board?.status === "inserted" ? t("classroom.v3.coursewareAdded") : board?.status === "inserting" ? t("classroom.v3.coursewareOpening") : board?.status === "failed" ? board.error || t("classroom.v3.addToWhiteboardFailed") : ready ? t("classroom.v3.coursewareReady") : failed ? item.conversionError || t("classroom.v3.conversionFailed") : converting ? t("classroom.v3.coursewareConverting") : "";
        return <article key={item.id} data-courseware-id={item.id}>
          <span className="classroom-v3-file-icon"><FileText /><small>{item.ext.toUpperCase()}</small></span>
          <div className="classroom-v3-file-copy"><strong>{item.name}</strong><small>{(item.size / 1024 / 1024).toFixed(1)} MB</small>{status && <p className={`classroom-v3-courseware-status${failed || board?.status === "failed" ? " is-error" : ""}`} role={failed || board?.status === "failed" ? "alert" : "status"}>{status}</p>}</div>
          <div className="classroom-v3-file-actions">{item.downloadUrl && <a href={item.downloadUrl} title={t("classroom.v3.downloadCourseware")}><Download /></a>}</div>
          {canManage && <div className="classroom-v3-file-permissions">
            {(["studentCanView", "studentCanDownload"] as const).map(field => {
              const enabled = update?.[field] ?? item[field];
              const label = t(`classroom.v3.${field}`);
              return <button key={field} type="button" role="switch" aria-label={label} aria-checked={enabled} aria-busy={waiting} disabled={waiting} onClick={() => void save(item, { [field]: !enabled })}>
                {field === "studentCanView" ? enabled ? <Eye /> : <EyeOff /> : <Download />}<span>{label}<small>{t(waiting && field in (update || {}) ? "classroom.v3.coursewareSaving" : enabled ? "classroom.v3.coursewarePermissionOn" : "classroom.v3.coursewarePermissionOff")}</small></span><i aria-hidden="true" className="courseware-switch-track" />
              </button>;
            })}
            <button type="button" className={board?.status === "inserted" ? "is-added" : ""} aria-busy={waiting || converting || board?.status === "inserting"} disabled={waiting || converting || board?.status === "inserting" || (ready && !boardAvailable)} onClick={() => ready ? void open(item) : void save(item, { whiteboardEnabled: true })}>
              {waiting || converting || board?.status === "inserting" ? <Loader2 className="animate-spin" /> : board?.status === "inserted" ? <Check /> : failed || board?.status === "failed" ? <RefreshCw /> : <Presentation />}<span>{t(waiting ? "classroom.v3.coursewareSaving" : board?.status === "inserted" ? "classroom.v3.coursewareAdded" : board?.status === "inserting" ? "classroom.v3.coursewareOpening" : converting ? "classroom.v3.coursewareConverting" : failed || board?.status === "failed" ? "classroom.v3.retry" : ready && !boardAvailable ? "classroom.v3.enteringWhiteboard" : ready ? "classroom.v3.openOnWhiteboard" : "classroom.v3.addToWhiteboard")}</span>
            </button>
            {item.whiteboardEnabled && <button type="button" className="courseware-remove" title={t("classroom.v3.coursewareRemove")} aria-label={t("classroom.v3.coursewareRemove")} disabled={waiting || board?.status === "inserting"} onClick={() => void save(item, { whiteboardEnabled: false })}><X /></button>}
          </div>}
          {notices[item.id] && !(!notices[item.id].error && (board?.status === "inserted" || (notices[item.id].action === "open" && board))) && <p className={`classroom-v3-courseware-feedback${notices[item.id].error ? " is-error" : ""}`} role={notices[item.id].error ? "alert" : "status"}>{notices[item.id].text}</p>}
        </article>;
      })}
    </div>
  </div>;
}
