"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { avatarInitials, userAvatarSource, AVATAR_PRESETS, presetAvatarSource, type AvatarPreset } from "@/lib/user-avatar";
import { AVATAR_FILE_ACCEPT, validateAvatarFile } from "@/lib/avatar-upload";
import { useTranslation } from "@/lib/i18n/context";

const ERROR_KEYS: Record<string, string> = {
  AVATAR_FILE_REQUIRED: "settingsPanel.errAvatarFileRequired",
  AVATAR_FILE_TOO_LARGE: "settingsPanel.errAvatarFileTooLarge",
  AVATAR_FILE_TYPE_INVALID: "settingsPanel.errAvatarFileTypeInvalid",
  AVATAR_STORAGE_UNAVAILABLE: "settingsPanel.errAvatarStorageUnavailable",
};

export function AvatarSettings({
  user,
}: {
  user: { avatar?: string; displayName?: string; name?: string };
}) {
  const { t } = useTranslation();
  const { updateUserAvatar } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [selection, setSelection] = useState<{ file: File; preview: string } | null>(null);
  const [preset, setPreset] = useState<AvatarPreset | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    return () => {
      if (selection) URL.revokeObjectURL(selection.preview);
    };
  }, [selection]);

  const handleSelect = (file?: File) => {
    if (!file) return;
    const error = validateAvatarFile(file);
    if (error) {
      setMessage({ text: t(ERROR_KEYS[error]), error: true });
      return;
    }
    setPreset(null);
    setSelection({ file, preview: URL.createObjectURL(file) });
    setMessage(null);
  };

  const handleSave = async () => {
    if ((!selection && preset === null) || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const body = selection ? new FormData() : JSON.stringify({ preset });
      if (body instanceof FormData && selection) body.append("file", selection.file);
      const response = await fetch("/api/auth/avatar", {
        method: "PUT",
        credentials: "same-origin",
        ...(typeof body === "string" ? { headers: { "Content-Type": "application/json" } } : {}),
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.avatar !== "string") {
        setMessage({
          text: t(ERROR_KEYS[data.code] || "settingsPanel.avatarUpdateFailed"),
          error: true,
        });
        return;
      }
      updateUserAvatar(data.avatar);
      setSelection(null);
      setPreset(null);
      setMessage({ text: t("settingsPanel.avatarUpdateSuccess"), error: false });
    } catch {
      setMessage({ text: t("settingsPanel.avatarUpdateFailed"), error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-border/60 bg-card rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-bold">{t("settingsPanel.avatar")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-start">
        <Avatar className="h-16 w-16 shrink-0 border border-border/80 shadow-inner">
          <AvatarImage src={selection?.preview ?? (preset !== null ? presetAvatarSource(preset) || undefined : user.avatar)} alt={t("settingsPanel.avatar")} />
          <AvatarFallback className="text-base bg-primary/10 text-primary font-bold">
            {avatarInitials(user.displayName || user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("settingsPanel.avatarDesc")}
          </p>
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="text-sm font-medium">{t("portalUpdates.avatarChoices")}</legend>
            <p className="text-xs text-muted-foreground">{t("portalUpdates.avatarInitialsHint")}</p>
            <div className="flex flex-wrap gap-2">
              {(["initials", ...AVATAR_PRESETS] as const).map((item) => {
                const source = presetAvatarSource(item) || undefined;
                const selected = preset === item || (!selection && preset === null && (item === "initials" ? !userAvatarSource(user.avatar) : user.avatar === source));
                return <button key={item} type="button" aria-label={t(`portalUpdates.avatar_${item}`)} aria-pressed={selected}
                  className={`relative rounded-full border-2 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary" : "border-transparent hover:border-border"}`}
                  onClick={() => { setPreset(item); setSelection(null); setMessage(null); }}>
                  <Avatar className="h-11 w-11"><AvatarImage src={source} alt=""/><AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{avatarInitials(user.displayName || user.name)}</AvatarFallback></Avatar>
                  {selected && <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-primary text-primary-foreground" aria-hidden="true"/>}
                </button>;
              })}
            </div>
          </fieldset>
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {t("settingsPanel.avatarUploadHint")}
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={AVATAR_FILE_ACCEPT}
            aria-label={t("settingsPanel.btnChooseAvatar")}
            aria-describedby={`${inputId}-hint`}
            className="hidden"
            disabled={saving}
            onChange={(event) => {
              handleSelect(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-xs"
              disabled={saving}
              aria-describedby={`${inputId}-hint`}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("settingsPanel.btnChooseAvatar")}
            </Button>
            <Button
              type="button"
              className="rounded-xl text-xs"
              disabled={(!selection && preset === null) || saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {saving ? t("common.saving") : t("settingsPanel.btnSaveAvatar")}
            </Button>
            {selection || preset !== null ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-xs"
                disabled={saving}
                onClick={() => { setSelection(null); setPreset(null); setMessage(null); }}
              >
                {t("common.cancel")}
              </Button>
            ) : null}
          </div>
          {selection ? (
            <p className="truncate text-xs text-muted-foreground" title={selection.file.name}>
              {selection.file.name}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className={`text-xs ${message?.error ? "text-destructive" : "text-muted-foreground"}`}>
            {message?.text}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
