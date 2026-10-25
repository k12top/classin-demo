"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/context";

export function CoursewareUploader({ courseId, sessionId, canUpload, onUploaded }: {
  courseId: string;
  sessionId?: string;
  canUpload: boolean;
  onUploaded: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const scopeQuery = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const forbidden = t("courseDetail.coursewareUploadForbidden");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!canUpload) { setError(forbidden); return; }
    if (!file) { setError(t("courseDetail.coursewareFileRequired")); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ext) { setError(t("courseDetail.coursewareExtensionRequired")); return; }
    inFlight.current = true;
    setUploading(true);
    setError("");
    setUploaded(false);
    try {
      const signed = await fetch(`/api/courses/${courseId}/courseware/upload-url${scopeQuery}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size }),
      });
      const upload = await signed.json();
      if (!signed.ok) throw new Error(signed.status === 403 ? forbidden : upload.error || t("courseDetail.errCwAddFailed"));
      const stored = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file });
      if (!stored.ok) throw new Error(t("courseDetail.coursewareOssUploadFailed"));
      const created = await fetch(`/api/courses/${courseId}/courseware${scopeQuery}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || file.name, objectKey: upload.objectKey, ext, size: file.size }),
      });
      if (!created.ok) {
        const result = await created.json();
        throw new Error(created.status === 403 ? forbidden : result.error || t("courseDetail.errCwAddFailed"));
      }
      setName("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setUploaded(true);
      await onUploaded();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("courseDetail.errCwAddFailed"));
    } finally {
      inFlight.current = false;
      setUploading(false);
    }
  };

  return <form onSubmit={submit} className="space-y-4" aria-busy={uploading}>
    <div className="space-y-2">
      <label htmlFor={nameId} className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("courseDetail.coursewareName")}</label>
      <Input id={nameId} placeholder={t("courseDetail.coursewareNamePlaceholder")} value={name}
        disabled={!canUpload || uploading} onChange={event => setName(event.target.value)}
        className="bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl" />
    </div>
    <div className="space-y-2">
      <label htmlFor={fileId} className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("courseDetail.chooseCoursewareFile")}</label>
      <Input id={fileId} ref={fileInput} type="file" accept=".ppt,.pptx,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.mp3,.mp4"
        disabled={!canUpload || uploading} onChange={event => {
          const selected = event.target.files?.[0] || null;
          setFile(selected);
          setUploaded(false);
          setError("");
          if (selected && !name.trim()) setName(selected.name);
        }} className="cursor-pointer bg-background border-border/80 hover:border-border focus-visible:ring-primary/50 text-sm rounded-xl file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/15" />
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{t("courseDetail.coursewareUploadHint")}</p>
    </div>
    {(error || !canUpload) && <p role="alert" className="text-xs text-red-500 bg-red-500/5 p-2 rounded-lg border border-red-500/20">{error || forbidden}</p>}
    {uploaded && <p role="status" className="text-xs text-emerald-600">{t("courseDetail.coursewareUploaded")}</p>}
    <Button type="submit" disabled={!canUpload || uploading || !file}
      className="w-full bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-semibold shadow-sm active:scale-[0.98]">
      <span className="flex items-center gap-2">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin text-current" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {t(uploading ? "courseDetail.uploadingToOss" : "courseDetail.uploadCourseware")}
      </span>
    </Button>
  </form>;
}
